import { nanoid } from "nanoid";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as orca from "@orca-so/whirlpools";
import { createSolanaRpc } from "@solana/kit";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { DEVNET_POOLS } from "./pools.js";

export interface StreamConfig {
  rpcUrl: string;
  durationMs: number;
  pollIntervalMs: number;
  heartbeatMs: number;
  maxConcurrent: number;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amountIn: string;
}

export interface RouteQuote {
  pool: string;
  tickSpacing: number;
  label: string;
  estimatedOut: string;
  fee: string;
}

export interface QuoteSnapshot {
  routes: RouteQuote[];
  bestRoute: { pool: string; estimatedOut: string } | null;
}

interface Session {
  id: string;
  params: QuoteParams;
  createdAt: number;
  expiresAt: number;
  ws: WebSocket | null;
  pollHandle: NodeJS.Timeout | null;
  heartbeatHandle: NodeJS.Timeout | null;
  expiryHandle: NodeJS.Timeout | null;
  lastBestEstimatedOut: string | null;
  lastBestPool: string | null;
  lastEmitTs: number;
  tickCount: number;
}

export interface InitResult {
  sessionId: string;
  expiresAt: number;
  durationMs: number;
}

type ClosedReason = "expired" | "error" | "client";

export class QuoteStreamHub {
  private sessions = new Map<string, Session>();
  private orcaConfigured = false;
  private rpc: ReturnType<typeof createSolanaRpc>;

  constructor(private readonly cfg: StreamConfig) {
    this.rpc = createSolanaRpc(cfg.rpcUrl);
  }

  async ensureConfigured(): Promise<void> {
    if (this.orcaConfigured) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (orca as any).setWhirlpoolsConfig("solanaDevnet");
    this.orcaConfigured = true;
  }

  initSession(params: QuoteParams): InitResult {
    if (this.sessions.size >= this.cfg.maxConcurrent) {
      throw new StreamCapacityError(this.cfg.maxConcurrent);
    }
    const id = nanoid();
    const now = Date.now();
    const expiresAt = now + this.cfg.durationMs;
    const session: Session = {
      id,
      params,
      createdAt: now,
      expiresAt,
      ws: null,
      pollHandle: null,
      heartbeatHandle: null,
      expiryHandle: setTimeout(() => this.expireSession(id), this.cfg.durationMs),
      lastBestEstimatedOut: null,
      lastBestPool: null,
      lastEmitTs: 0,
      tickCount: 0,
    };
    this.sessions.set(id, session);
    return { sessionId: id, expiresAt, durationMs: this.cfg.durationMs };
  }

  attachWebSocket(sessionId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      ws.close(4404, "session_not_found");
      return false;
    }
    if (session.ws) {
      ws.close(4409, "session_already_attached");
      return false;
    }
    if (Date.now() >= session.expiresAt) {
      ws.close(4410, "session_expired");
      this.dropSession(sessionId);
      return false;
    }

    session.ws = ws;
    this.send(session, {
      type: "open",
      sessionId,
      params: session.params,
      expiresAt: session.expiresAt,
      poolsEvaluated: DEVNET_POOLS.length,
    });

    ws.on("close", () => {
      session.ws = null;
      this.stopPolling(session);
    });
    ws.on("error", () => {
      session.ws = null;
      this.stopPolling(session);
    });

    void this.startPolling(session);
    return true;
  }

  private async startPolling(session: Session): Promise<void> {
    await this.ensureConfigured();
    const tick = async () => {
      if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
      try {
        const snapshot = await this.quoteOnce(session.params);
        session.tickCount += 1;
        const best = snapshot.bestRoute;
        const changed =
          best &&
          (best.estimatedOut !== session.lastBestEstimatedOut ||
            best.pool !== session.lastBestPool);
        if (changed) {
          session.lastBestEstimatedOut = best.estimatedOut;
          session.lastBestPool = best.pool;
          session.lastEmitTs = Date.now();
          this.send(session, {
            type: "tick",
            ts: session.lastEmitTs,
            tickCount: session.tickCount,
            bestRoute: best,
            routes: snapshot.routes,
          });
        }
      } catch (err) {
        this.send(session, {
          type: "error",
          ts: Date.now(),
          message: String(err),
        });
      }
    };

    void tick();
    session.pollHandle = setInterval(tick, this.cfg.pollIntervalMs);
    session.heartbeatHandle = setInterval(() => {
      if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
      const since = Date.now() - session.lastEmitTs;
      if (since >= this.cfg.heartbeatMs) {
        this.send(session, {
          type: "heartbeat",
          ts: Date.now(),
          tickCount: session.tickCount,
        });
      }
    }, this.cfg.heartbeatMs);
  }

  private stopPolling(session: Session): void {
    if (session.pollHandle) {
      clearInterval(session.pollHandle);
      session.pollHandle = null;
    }
    if (session.heartbeatHandle) {
      clearInterval(session.heartbeatHandle);
      session.heartbeatHandle = null;
    }
  }

  private expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.closeSession(session, "expired");
  }

  private closeSession(session: Session, reason: ClosedReason): void {
    this.stopPolling(session);
    if (session.expiryHandle) {
      clearTimeout(session.expiryHandle);
      session.expiryHandle = null;
    }
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      this.send(session, { type: "closed", ts: Date.now(), reason });
      session.ws.close(1000, reason);
    }
    this.sessions.delete(session.id);
  }

  private dropSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.stopPolling(session);
    if (session.expiryHandle) clearTimeout(session.expiryHandle);
    this.sessions.delete(sessionId);
  }

  private send(session: Session, payload: Record<string, unknown>): void {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    session.ws.send(JSON.stringify(payload));
  }

  async quoteOnce(params: QuoteParams): Promise<QuoteSnapshot> {
    await this.ensureConfigured();
    const amountInBigInt = BigInt(params.amountIn);
    const routes: RouteQuote[] = [];

    await Promise.all(
      DEVNET_POOLS.map(async (pool) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (orca as any).swapInstructions(
            this.rpc,
            { inputAmount: amountInBigInt, mint: params.inputMint },
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
            fee,
          });
        } catch (poolErr) {
          console.warn(`Pool ${pool.address} (${pool.label}) error:`, String(poolErr));
        }
      }),
    );

    routes.sort((a, b) => {
      const diff = BigInt(b.estimatedOut) - BigInt(a.estimatedOut);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    const bestRoute = routes[0]
      ? { pool: routes[0].pool, estimatedOut: routes[0].estimatedOut }
      : null;

    return { routes, bestRoute };
  }
}

export class StreamCapacityError extends Error {
  constructor(public readonly cap: number) {
    super(`Stream capacity reached (${cap} active sessions)`);
  }
}

export interface UpgradeRouter {
  handle: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  wss: WebSocketServer;
}

export function createUpgradeRouter(
  hub: QuoteStreamHub,
  pathPrefix: string,
): UpgradeRouter {
  const wss = new WebSocketServer({ noServer: true });

  function parseSessionId(url: string | undefined): string | null {
    if (!url) return null;
    const match = url.match(new RegExp(`^${pathPrefix}/([A-Za-z0-9_-]{6,64})(?:\\?.*)?$`));
    return match ? match[1]! : null;
  }

  return {
    wss,
    handle(req, socket, head) {
      const sessionId = parseSessionId(req.url);
      if (!sessionId) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        hub.attachWebSocket(sessionId, ws);
      });
    },
  };
}
