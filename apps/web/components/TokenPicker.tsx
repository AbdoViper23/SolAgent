"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { CRYPTO_TOKENS, type CryptoToken } from "@/lib/tokens";
import { getGlyph } from "@/lib/tokens";
import { cn } from "@/lib/utils";

interface TokenPickerProps {
  value: string; // symbol
  onChange: (symbol: string) => void;
  disabled?: boolean;
  exclude?: string; // symbol to hide (e.g. the other side of the pair)
  className?: string;
}

export function TokenPicker({ value, onChange, disabled, exclude, className }: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const tokens = useMemo<CryptoToken[]>(() => {
    return Object.values(CRYPTO_TOKENS).filter(
      (t) => t.symbol !== exclude &&
        (query === "" ||
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.label.toLowerCase().includes(query.toLowerCase())),
    );
  }, [exclude, query]);

  const selected = CRYPTO_TOKENS[value];

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm font-medium",
          "hover:border-primary/60 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className="font-mono text-base">{getGlyph(value)}</span>
        <span>{selected?.symbol ?? value}</span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-background shadow-xl">
          <div className="p-2">
            <input
              type="text"
              autoFocus
              placeholder="Search tokens..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-border bg-background/60 px-2 py-1 text-sm outline-none focus:border-primary/60"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto pb-1">
            {tokens.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
            ) : (
              tokens.map((t) => (
                <li key={t.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t.symbol);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50",
                      t.symbol === value && "bg-primary/10",
                    )}
                  >
                    <span className="font-mono text-base">{getGlyph(t.symbol)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{t.symbol}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.label}</div>
                    </div>
                    {t.isStable && (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                        STABLE
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
