import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as orca from "@orca-so/whirlpools";
import { createSolanaRpc } from "@solana/kit";
import "dotenv/config";
import { DEVNET_POOLS } from "./pools.js";
import {
  QuoteStreamHub,
  StreamCapacityError,
  createUpgradeRouter,
} from "./streaming.js";
import { buildStreamPaymentMiddleware } from "./x402.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

const MERCHANT = process.env.MERCHANT_ADDRESS!;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

if (!MERCHANT) {
  console.error("MERCHANT_ADDRESS env var required");
  process.exit(1);
}

const STREAM_DURATION_MS = Number(process.env.STREAM_DURATION_MS ?? 60_000);
const STREAM_POLL_INTERVAL_MS = Number(process.env.STREAM_POLL_INTERVAL_MS ?? 500);
const STREAM_HEARTBEAT_MS = Number(process.env.STREAM_HEARTBEAT_MS ?? 5_000);
const STREAM_PRICE_USDC = process.env.STREAM_PRICE_USDC ?? "0.005";
const STREAM_MAX_CONCURRENT = Number(process.env.STREAM_MAX_CONCURRENT ?? 64);
const STREAM_INIT_PATH = "/stream/quote/init";
const STREAM_WS_PREFIX = "/stream/quote";

const PRICE_ATOMIC_UNITS = Math.round(Number(STREAM_PRICE_USDC) * 1_000_000).toString();

const hub = new QuoteStreamHub({
  rpcUrl: RPC_URL,
  durationMs: STREAM_DURATION_MS,
  pollIntervalMs: STREAM_POLL_INTERVAL_MS,
  heartbeatMs: STREAM_HEARTBEAT_MS,
  maxConcurrent: STREAM_MAX_CONCURRENT,
});

const AnalyzeSchema = z.object({
  inputMint: z.string().min(32),
  outputMint: z.string().min(32),
  amountIn: z.string().regex(/^\d+$/, "amountIn must be a whole number string"),
});

interface RouteResult {
  pool: string;
  tickSpacing: number;
  label: string;
  estimatedOut: string;
  priceImpactPct: string;
  fee: string;
}

app.post("/analyze", async (req, res) => {
  const parsed = AnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const { inputMint, outputMint, amountIn } = parsed.data;
  const amountInBigInt = BigInt(amountIn);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (orca as any).setWhirlpoolsConfig("solanaDevnet");
    const rpc = createSolanaRpc(RPC_URL);

    const routes: RouteResult[] = [];

    await Promise.all(
      DEVNET_POOLS.map(async (pool) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (orca as any).swapInstructions(
            rpc,
            { inputAmount: amountInBigInt, mint: inputMint },
            pool.address,
            100,
          );
          const quote = result?.quote ?? {};
          const estimatedOut = (quote.tokenEstOut ?? quote.tokenMinOut ?? 0n).toString();
          const fee = (quote.tradeFee ?? quote.feeAmount ?? 0n).toString();

          routes.push({
            pool: pool.address,
            tickSpacing: pool.tickSpacing,
            label: pool.label,
            estimatedOut,
            priceImpactPct: "0.0000",
            fee,
          });
        } catch (poolErr) {
          console.warn(`Pool ${pool.address} (${pool.label}) error:`, String(poolErr));
        }
      })
    );

    routes.sort((a, b) => {
      const diff = BigInt(b.estimatedOut) - BigInt(a.estimatedOut);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    const bestRoute = routes[0]
      ? { pool: routes[0].pool, estimatedOut: routes[0].estimatedOut }
      : null;

    res.json({
      inputMint,
      outputMint,
      amountIn,
      routes,
      bestRoute,
      routesEvaluated: DEVNET_POOLS.length,
    });
  } catch (err) {
    res.status(503).json({ error: "Swap analysis failed", detail: String(err) });
  }
});

const streamPayment = buildStreamPaymentMiddleware({
  merchantAddress: MERCHANT,
  facilitatorUrl: FACILITATOR_URL,
  priceAtomicUnits: PRICE_ATOMIC_UNITS,
  initRoutePath: STREAM_INIT_PATH,
});

app.post(STREAM_INIT_PATH, streamPayment, async (req, res) => {
  const parsed = AnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  try {
    const init = hub.initSession(parsed.data);
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
    const wsScheme = proto === "https" ? "wss" : "ws";
    const host = req.headers.host;
    const wsUrl = `${wsScheme}://${host}${STREAM_WS_PREFIX}/${init.sessionId}`;
    res.json({ ...init, wsUrl, params: parsed.data });
  } catch (err) {
    if (err instanceof StreamCapacityError) {
      res.status(503).json({ error: "Stream capacity reached", cap: err.cap });
      return;
    }
    res.status(500).json({ error: "Failed to init stream", detail: String(err) });
  }
});

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    stream: {
      durationMs: STREAM_DURATION_MS,
      pollIntervalMs: STREAM_POLL_INTERVAL_MS,
      heartbeatMs: STREAM_HEARTBEAT_MS,
      priceAtomicUnits: PRICE_ATOMIC_UNITS,
      maxConcurrent: STREAM_MAX_CONCURRENT,
    },
  })
);

const httpServer = createServer(app);
const upgrader = createUpgradeRouter(hub, STREAM_WS_PREFIX);
httpServer.on("upgrade", (req, socket, head) => {
  if (req.url && req.url.startsWith(`${STREAM_WS_PREFIX}/`)) {
    upgrader.handle(req, socket, head);
    return;
  }
  socket.destroy();
});

const PORT = Number(process.env.PORT ?? 4022);
httpServer.listen(PORT, () => {
  console.log(`Swap analyzer service listening on :${PORT}`);
  console.log(
    `[stream] init=${STREAM_INIT_PATH} ws=${STREAM_WS_PREFIX}/:id duration=${STREAM_DURATION_MS}ms poll=${STREAM_POLL_INTERVAL_MS}ms price=$${STREAM_PRICE_USDC}`
  );
  console.log(`[x402] merchant=${MERCHANT} facilitator=${FACILITATOR_URL}`);
});
