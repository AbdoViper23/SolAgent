"use client";
import * as React from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { cn, shortAddress, explorerAddressUrl } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface AddressBadgeProps {
  address: string;
  cluster?: "devnet" | "mainnet" | "testnet";
  showExplorer?: boolean;
  lead?: number;
  tail?: number;
  className?: string;
}

export function AddressBadge({
  address,
  cluster = "devnet",
  showExplorer = true,
  lead = 4,
  tail = 4,
  className,
}: AddressBadgeProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [address]);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-xs",
          className
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
              aria-label={`Copy address ${address}`}
            >
              <span className="tabular-nums">
                {shortAddress(address, lead, tail)}
              </span>
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3 opacity-60" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono">{address}</p>
            <p className="mt-1 text-muted-foreground">
              {copied ? "Copied!" : "Click to copy"}
            </p>
          </TooltipContent>
        </Tooltip>
        {showExplorer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerAddressUrl(address, cluster)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                aria-label="View on Solana Explorer"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent>View on Solana Explorer</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
