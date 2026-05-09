import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
// import { paymentMiddleware } from "@x402/express"; // x402 v2.11 API change — see TODO below
import axios from "axios";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));

app.use(rateLimit({ windowMs: 60_000, max: 60 }));

const MERCHANT = process.env.MERCHANT_ADDRESS!;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const SOL_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";

if (!MERCHANT) {
  console.error("MERCHANT_ADDRESS env var required");
  process.exit(1);
}

// TODO(x402): @x402/express v2.11 changed paymentMiddleware signature to
// (routes, server, paywallConfig?). Re-enable by constructing an x402ResourceServer
// with ExactSvmScheme from @x402/svm and the PayAI facilitator client.
// For now the endpoints are open so you can validate the data flow.
console.log(`[x402 disabled] merchant=${MERCHANT} facilitator=${FACILITATOR_URL}`);

interface PythPrice {
  feed: string;
  price: string;
  conf: string;
  exponent: number;
  publishTime: number;
  stale: boolean;
}

async function fetchSolUsdPrice(): Promise<PythPrice> {
  const { data } = await axios.get(HERMES_URL, {
    params: { "ids[]": SOL_FEED_ID },
    timeout: 5_000,
  });
  const parsed = data.parsed?.[0];
  if (!parsed) throw new Error("No price data from Hermes");
  const exp = parsed.price.expo;
  const rawPrice = Number(parsed.price.price) * Math.pow(10, exp);
  const rawConf = Number(parsed.price.conf) * Math.pow(10, exp);
  const publishTime = parsed.price.publish_time;
  const stale = Date.now() / 1000 - publishTime > 60;
  return {
    feed: "SOL/USD",
    price: rawPrice.toFixed(6),
    conf: rawConf.toFixed(6),
    exponent: exp,
    publishTime,
    stale,
  };
}

app.get("/price/sol-usd", async (_req, res) => {
  try {
    const price = await fetchSolUsdPrice();
    res.json(price);
  } catch (err) {
    res.status(503).json({ error: "Failed to fetch price", detail: String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = Number(process.env.PORT ?? 4021);
app.listen(PORT, () => console.log(`Oracle service listening on :${PORT}`));
