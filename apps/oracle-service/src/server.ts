import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import axios from "axios";
import "dotenv/config";
import {
  CRYPTO_TOKENS,
  EQUITY_TICKERS,
  getEquityTicker,
  getCryptoToken,
  type CryptoToken,
  type EquityTicker,
} from "@workspace/sdk/tokens";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

const MERCHANT = process.env.MERCHANT_ADDRESS!;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 2000);
const STALE_THRESHOLD_S = Number(process.env.STALE_THRESHOLD_S ?? 60);

if (!MERCHANT) {
  console.error("MERCHANT_ADDRESS env var required");
  process.exit(1);
}

console.log(`[x402 disabled] merchant=${MERCHANT} facilitator=${FACILITATOR_URL}`);

interface PriceQuote {
  symbol: string;
  type: "crypto" | "equity";
  label: string;
  feedId: string;
  price: string;
  conf: string;
  exponent: number;
  publishTime: number;
  stale: boolean;
}

const cache = new Map<string, { fetchedAt: number; quote: PriceQuote }>();

async function fetchPythBatch(feedIds: string[]): Promise<Map<string, {
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}>> {
  const params = new URLSearchParams();
  for (const id of feedIds) params.append("ids[]", id);
  const { data } = await axios.get(`${HERMES_URL}?${params.toString()}`, { timeout: 5_000 });
  const parsed = data.parsed ?? [];
  const out = new Map<string, { price: number; conf: number; expo: number; publishTime: number }>();
  for (const item of parsed) {
    const expo = item.price.expo;
    out.set(item.id.toLowerCase(), {
      price: Number(item.price.price) * Math.pow(10, expo),
      conf: Number(item.price.conf) * Math.pow(10, expo),
      expo,
      publishTime: item.price.publish_time,
    });
  }
  return out;
}

function buildQuoteFromHermes(
  symbol: string,
  type: "crypto" | "equity",
  label: string,
  feedId: string,
  raw: { price: number; conf: number; expo: number; publishTime: number },
): PriceQuote {
  return {
    symbol,
    type,
    label,
    feedId,
    price: raw.price.toFixed(6),
    conf: raw.conf.toFixed(6),
    exponent: raw.expo,
    publishTime: raw.publishTime,
    stale: Date.now() / 1000 - raw.publishTime > STALE_THRESHOLD_S,
  };
}

function stableQuote(token: CryptoToken): PriceQuote {
  return {
    symbol: token.symbol,
    type: "crypto",
    label: token.label,
    feedId: "stable",
    price: "1.000000",
    conf: "0.000000",
    exponent: 0,
    publishTime: Math.floor(Date.now() / 1000),
    stale: false,
  };
}

async function getCryptoQuote(token: CryptoToken): Promise<PriceQuote> {
  if (token.isStable && !token.pythFeedId) return stableQuote(token);
  if (!token.pythFeedId) {
    throw new Error(`No Pyth feed configured for ${token.symbol}`);
  }
  const cacheKey = `crypto:${token.symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quote;
  }
  const raw = await fetchPythBatch([token.pythFeedId]);
  const hit = raw.get(token.pythFeedId.toLowerCase());
  if (!hit) throw new Error(`No price data for ${token.symbol} from Hermes`);
  const quote = buildQuoteFromHermes(token.symbol, "crypto", token.label, token.pythFeedId, hit);
  cache.set(cacheKey, { fetchedAt: Date.now(), quote });
  return quote;
}

async function getEquityQuote(ticker: EquityTicker): Promise<PriceQuote> {
  const cacheKey = `equity:${ticker.symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quote;
  }
  const raw = await fetchPythBatch([ticker.pythFeedId]);
  const hit = raw.get(ticker.pythFeedId.toLowerCase());
  if (!hit) throw new Error(`No price data for ${ticker.symbol} from Hermes`);
  const quote = buildQuoteFromHermes(ticker.symbol, "equity", ticker.label, ticker.pythFeedId, hit);
  cache.set(cacheKey, { fetchedAt: Date.now(), quote });
  return quote;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/price/crypto/:symbol", async (req, res) => {
  const token = getCryptoToken(req.params.symbol);
  if (!token) {
    res.status(404).json({
      error: "unknown_symbol",
      supported: Object.keys(CRYPTO_TOKENS),
    });
    return;
  }
  try {
    const quote = await getCryptoQuote(token);
    res.json(quote);
  } catch (err) {
    res.status(503).json({ error: "Failed to fetch price", symbol: token.symbol, detail: String(err) });
  }
});

app.get("/price/equity/:ticker", async (req, res) => {
  const ticker = getEquityTicker(req.params.ticker);
  if (!ticker) {
    res.status(404).json({
      error: "unknown_ticker",
      supported: Object.keys(EQUITY_TICKERS),
    });
    return;
  }
  try {
    const quote = await getEquityQuote(ticker);
    res.json(quote);
  } catch (err) {
    res.status(503).json({ error: "Failed to fetch price", ticker: ticker.symbol, detail: String(err) });
  }
});

// Batch endpoint — used by the dashboard to refresh ~14 assets in one round-trip.
app.get("/prices", async (req, res) => {
  const symbolsParam = String(req.query.symbols ?? "");
  if (!symbolsParam) {
    res.status(400).json({ error: "symbols query param required (comma-separated)" });
    return;
  }
  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const results: Record<string, PriceQuote | { error: string }> = {};

  await Promise.all(
    symbols.map(async (sym) => {
      const crypto = getCryptoToken(sym);
      const equity = getEquityTicker(sym);
      try {
        if (crypto) {
          results[sym] = await getCryptoQuote(crypto);
        } else if (equity) {
          results[sym] = await getEquityQuote(equity);
        } else {
          results[sym] = { error: "unknown_symbol" };
        }
      } catch (err) {
        results[sym] = { error: String(err) };
      }
    }),
  );

  res.json({ quotes: results, fetchedAt: Date.now() });
});

// Backward-compat alias for the existing /price/sol-usd endpoint.
app.get("/price/sol-usd", async (_req, res) => {
  const sol = getCryptoToken("SOL");
  if (!sol) { res.status(500).json({ error: "SOL token missing from registry" }); return; }
  try {
    const quote = await getCryptoQuote(sol);
    // Preserve the legacy response shape used by HeroLiveCard / PricePanel.
    res.json({
      feed: "SOL/USD",
      price: quote.price,
      conf: quote.conf,
      exponent: quote.exponent,
      publishTime: quote.publishTime,
      stale: quote.stale,
    });
  } catch (err) {
    res.status(503).json({ error: "Failed to fetch price", detail: String(err) });
  }
});

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    supportedCrypto: Object.keys(CRYPTO_TOKENS),
    supportedEquity: Object.keys(EQUITY_TICKERS),
    cacheTtlMs: CACHE_TTL_MS,
  })
);

const PORT = Number(process.env.PORT ?? 4021);
app.listen(PORT, () => {
  console.log(`Oracle service listening on :${PORT}`);
  console.log(`[crypto] ${Object.keys(CRYPTO_TOKENS).join(", ")}`);
  console.log(`[equity] ${Object.keys(EQUITY_TICKERS).join(", ")}`);
});
