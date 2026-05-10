"use client";

import { useEffect } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type ProposalKind = "deposit" | "withdraw" | "swap";

export interface DepositProposal {
  kind: "deposit";
  symbol: string;
  amount: string;
}
export interface WithdrawProposal {
  kind: "withdraw";
  symbol: string;
  amount: string;
}
export interface SwapProposal {
  kind: "swap";
  inputSymbol: string;
  outputSymbol: string;
  amountIn: string;
  estimatedOut?: string;
  bestPool?: string;
  priceImpactPct?: string;
}
export type Proposal = DepositProposal | WithdrawProposal | SwapProposal;

interface Props {
  proposal: Proposal | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<ProposalKind, string> = {
  deposit: "Deposit to vault",
  withdraw: "Withdraw from vault",
  swap: "Swap on Orca devnet",
};

const KIND_ACCENT: Record<ProposalKind, string> = {
  deposit: "from-emerald-500/20 to-emerald-500/5",
  withdraw: "from-amber-500/20 to-amber-500/5",
  swap: "from-purple-500/20 to-purple-500/5",
};

export function ConfirmTxModal({ proposal, busy, onConfirm, onCancel }: Props) {
  useEffect(() => {
    if (!proposal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proposal, busy, onCancel]);

  if (!proposal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl bg-gradient-to-br ${KIND_ACCENT[proposal.kind]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="space-y-1">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              voice proposal
            </Badge>
            <h2 className="text-lg font-semibold">{KIND_LABEL[proposal.kind]}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-2 space-y-3">
          {proposal.kind === "deposit" && (
            <Row label="Amount" value={`${proposal.amount} ${proposal.symbol}`} />
          )}
          {proposal.kind === "withdraw" && (
            <Row label="Amount" value={`${proposal.amount} ${proposal.symbol}`} />
          )}
          {proposal.kind === "swap" && (
            <>
              <Row
                label="Pay"
                value={`${proposal.amountIn} ${proposal.inputSymbol}`}
              />
              <Row
                label="Receive (est.)"
                value={
                  proposal.estimatedOut
                    ? `${proposal.estimatedOut} ${proposal.outputSymbol}`
                    : "—"
                }
              />
              {proposal.bestPool && (
                <Row label="Best pool" value={proposal.bestPool.slice(0, 10) + "…"} />
              )}
              {proposal.priceImpactPct && (
                <Row label="Price impact" value={`${proposal.priceImpactPct}%`} />
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground border-t border-border/50">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Your wallet will prompt you to sign the transaction.</span>
        </div>

        <div className="flex gap-2 p-4 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="flex-1">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm & sign"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
