"use client";
import { Sparkles, X } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/lib/demo/DemoModeContext";

export function DemoBanner() {
  const { exitDemo } = useDemoMode();
  const { setVisible } = useWalletModal();

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#14F195]/35 bg-gradient-to-r from-[#14F195]/10 via-[#9945FF]/10 to-[#14F195]/10 px-4 py-3 backdrop-blur-md">
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-[#14F195]/20 blur-2xl" />
      <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-[#9945FF]/20 blur-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#14F195]/20 ring-1 ring-[#14F195]/40">
            <Sparkles className="h-3.5 w-3.5 text-[#14F195]" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">
              Demo Mode <span className="text-muted-foreground font-normal">— exploring with mock data</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Nothing is on-chain. All balances and transactions are simulated.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVisible(true)}
            className="border-[#9945FF]/40 bg-[#9945FF]/10 text-[#9945FF] hover:bg-[#9945FF]/20 hover:text-[#9945FF]"
          >
            Connect real wallet
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={exitDemo}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Exit demo
          </Button>
        </div>
      </div>
    </div>
  );
}
