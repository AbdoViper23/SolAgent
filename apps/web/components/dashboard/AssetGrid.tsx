"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  CRYPTO_SYMBOLS,
  EQUITY_SYMBOLS,
  CRYPTO_TOKENS,
  EQUITY_TICKERS,
  getGlyph,
  formatPriceUsd,
  formatStaleAge,
} from "@/lib/tokens";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL ?? "";
const ALL_SYMBOLS = [...CRYPTO_SYMBOLS, ...EQUITY_SYMBOLS];

interface QuoteRow {
  symbol: string;
  type: "crypto" | "equity";
  label: string;
  price: string;
  conf: string;
  publishTime: number;
  stale: boolean;
}

type QuoteState = Record<string, QuoteRow | { error: string; symbol: string }>;

export function AssetGrid() {
  const [quotes, setQuotes] = useState<QuoteState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ORACLE_URL) {
      setLoading(false);
      return;
    }
    let alive = true;

    async function fetchQuotes() {
      try {
        const { data } = await axios.get(
          `${ORACLE_URL}/prices?symbols=${ALL_SYMBOLS.join(",")}`,
          { timeout: 8000 },
        );
        if (!alive) return;
        setQuotes(data.quotes ?? {});
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!ORACLE_URL) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Set <code>NEXT_PUBLIC_ORACLE_SERVICE_URL</code> to view live asset prices.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Tradeable on devnet"
        subtitle="Crypto pairs routed via Orca Whirlpools. Click a symbol to use it in the swap panel."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {CRYPTO_SYMBOLS.map((sym) => (
          <AssetCard
            key={sym}
            symbol={sym}
            label={CRYPTO_TOKENS[sym].label}
            type="crypto"
            quote={quotes[sym]}
            loading={loading}
            isStable={CRYPTO_TOKENS[sym].isStable}
          />
        ))}
      </div>

      <SectionHeader
        title="Watch-only — US equities via Pyth"
        subtitle="Real-time quotes during US market hours. Tokenized stock trading (xStocks) is mainnet-only."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {EQUITY_SYMBOLS.map((sym) => (
          <AssetCard
            key={sym}
            symbol={sym}
            label={EQUITY_TICKERS[sym].label}
            type="equity"
            quote={quotes[sym]}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

interface AssetCardProps {
  symbol: string;
  label: string;
  type: "crypto" | "equity";
  quote: QuoteRow | { error: string; symbol: string } | undefined;
  loading: boolean;
  isStable?: boolean;
}

function AssetCard({ symbol, label, type, quote, loading, isStable }: AssetCardProps) {
  const errored = quote && "error" in quote;
  const valid = quote && !("error" in quote) ? (quote as QuoteRow) : null;

  return (
    <Card
      className={cn(
        "p-3 transition-shadow hover:shadow-md",
        type === "equity" && "border-warning/30 bg-warning/[0.02]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg opacity-80">{getGlyph(symbol)}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{symbol}</div>
            <div className="truncate text-[10px] text-muted-foreground">{label}</div>
          </div>
        </div>
        {type === "equity" && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium text-warning">
            WATCH
          </span>
        )}
        {isStable && (
          <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success">
            STABLE
          </span>
        )}
      </div>

      <div className="mt-3">
        {loading && !valid ? (
          <div className="h-6 w-20 animate-pulse rounded bg-muted/50" />
        ) : errored ? (
          <div className="text-xs text-destructive">unavailable</div>
        ) : valid ? (
          <>
            <div className="font-mono text-base font-semibold tabular-nums">
              {formatPriceUsd(valid.price)}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{formatStaleAge(valid.publishTime)}</span>
              {valid.stale && <span className="text-warning">stale</span>}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">—</div>
        )}
      </div>
    </Card>
  );
}
