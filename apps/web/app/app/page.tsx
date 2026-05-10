"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const ConnectButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false }
);
const VaultPanel = dynamic(
  () => import("@/components/VaultPanel").then((m) => m.VaultPanel),
  { ssr: false }
);
const SwapPanel = dynamic(
  () => import("@/components/SwapPanel").then((m) => m.SwapPanel),
  { ssr: false }
);
const PricePanel = dynamic(
  () => import("@/components/PricePanel").then((m) => m.PricePanel),
  { ssr: false }
);
const VoiceWidget = dynamic(
  () => import("@/components/voice/VoiceWidget").then((m) => m.VoiceWidget),
  { ssr: false }
);

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 18 },
  },
};

export default function AppPage() {
  const { connected } = useWallet();

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="aurora-bg" />
      <div className="bg-grid bg-grid-fade pointer-events-none fixed inset-0 -z-10 opacity-30" />

      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 px-4 py-8 md:py-12">
        {!connected ? (
          <ConnectPrompt />
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            <motion.div variants={itemVariants}>
              <StatusStrip />
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-3">
              <motion.div variants={itemVariants} className="lg:col-span-2">
                <VaultPanel />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-6">
                <PricePanel />
                <SwapPanel />
              </motion.div>
            </div>
          </motion.div>
        )}
      </main>

      <Footer />

      <VoiceWidget />
    </div>
  );
}

function StatusStrip() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/25 px-4 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="select-none font-mono text-[11px] text-muted-foreground/40">$</span>
        <Badge
          variant="outline"
          className="gap-1.5 border-[#14F195]/30 bg-[#14F195]/10 font-mono text-[10px] text-[#14F195]"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#14F195] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#14F195]" />
          </span>
          devnet
        </Badge>
      </div>
      <div className="h-3 w-px bg-border/50" />
      <span className="font-mono text-[11px] text-muted-foreground">
        Anchor <span className="text-foreground/50">0.31</span>
        <span className="mx-1.5 text-border/80">·</span>
        Orca Whirlpools
        <span className="mx-1.5 text-border/80">·</span>
        Pyth
      </span>
      <div className="ml-auto hidden items-center gap-1.5 md:flex">
        <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          claude desktop
        </kbd>
        <span className="text-[11px] text-muted-foreground">can drive this vault via MCP</span>
      </div>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <Card className="ring-gradient relative w-full max-w-sm overflow-hidden border-border/40 bg-card/60 backdrop-blur-2xl">
          <div className="absolute inset-0 -z-10 bg-aurora opacity-20" />
          <div className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#9945FF]/60 to-transparent" />
          <CardContent className="space-y-6 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-solana-gradient shadow-xl ring-1 ring-white/10">
              <Wallet className="h-8 w-8 text-white drop-shadow-lg" />
            </div>
            <div className="space-y-2.5">
              <h2 className="text-2xl font-bold tracking-tight">
                Connect your wallet
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Connect a Solana{" "}
                <span className="rounded bg-border/60 px-1 py-0.5 font-mono text-xs text-foreground/70">devnet</span>{" "}
                wallet (Phantom, Solflare, Backpack…) to access your AI trading vault.
              </p>
            </div>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
            <div className="flex items-center justify-center gap-2 border-t border-border/40 pt-4 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-[#14F195]" />
              <span>Self-custodied · You hold the keys</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-3 w-3 rotate-180" />
              Back to landing
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
