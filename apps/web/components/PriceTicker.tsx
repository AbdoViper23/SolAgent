"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { TICKER_SYMBOLS, getGlyph, formatPriceUsd } from "@/lib/tokens";

const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL ?? "";

interface QuoteRow {
  symbol: string;
  type: "crypto" | "equity";
  label: string;
  price: string;
  stale?: boolean;
  error?: string;
}

export function PriceTicker() {
  const [quotes, setQuotes] = useState<Record<string, QuoteRow>>({});

  useEffect(() => {
    if (!ORACLE_URL) return;
    let alive = true;

    async function fetchQuotes() {
      try {
        const { data } = await axios.get(
          `${ORACLE_URL}/prices?symbols=${TICKER_SYMBOLS.join(",")}`,
          { timeout: 8000 },
        );
        if (!alive) return;
        setQuotes(data.quotes ?? {});
      } catch {
        // network blip — keep last quotes
      }
    }

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!ORACLE_URL) return null;

  const orderedRows: QuoteRow[] = TICKER_SYMBOLS.map((sym) => {
    const q = quotes[sym];
    if (!q || "error" in q) {
      return { symbol: sym, type: "crypto", label: sym, price: "—" };
    }
    return q as QuoteRow;
  });
  const doubled = [...orderedRows, ...orderedRows];

  return (
    <div className="relative w-full overflow-hidden border-y border-border/40 bg-background/60 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
      <div className="flex animate-marquee gap-8 py-3 whitespace-nowrap">
        {doubled.map((row, i) => (
          <div key={`${row.symbol}-${i}`} className="flex items-center gap-2 text-sm">
            <span className="font-mono opacity-70">{getGlyph(row.symbol)}</span>
            <span className="font-medium">{row.symbol}</span>
            <span className="font-mono tabular-nums">
              {row.price === "—" ? "—" : formatPriceUsd(row.price)}
            </span>
            {row.type === "equity" && (
              <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                WATCH
              </span>
            )}
            {row.stale && (
              <span className="text-[10px] text-muted-foreground">(stale)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
