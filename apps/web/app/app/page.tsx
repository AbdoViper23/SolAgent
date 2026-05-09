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
    </div>
  );
}

function StatusStrip() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3 backdrop-blur-md">
      <Badge
        variant="outline"
        className="gap-1.5 border-solana-green/30 bg-solana-green/10 font-mono text-[11px] text-solana-green"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-solana-green opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-solana-green" />
        </span>
        devnet
      </Badge>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="font-mono text-xs text-muted-foreground">
        Anchor 0.31 · Orca Whirlpools · Pyth
      </span>
      <span className="ml-auto text-[11px] text-muted-foreground">
        Tip:{" "}
        <span className="font-mono text-foreground/70">
          claude desktop
        </span>{" "}
        can drive this vault via MCP.
      </span>
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
        <Card className="relative w-full max-w-md overflow-hidden border-border/60 bg-card/70 backdrop-blur-xl">
          <div className="absolute inset-0 -z-10 bg-aurora opacity-30" />
          <CardContent className="space-y-6 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-solana-gradient shadow-lg ring-1 ring-white/10">
              <Wallet className="h-7 w-7 text-white drop-shadow" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Connect your wallet
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Connect a Solana <span className="font-mono">devnet</span>{" "}
                wallet (Phantom, Solflare, Backpack…) to access your AI
                trading vault.
              </p>
            </div>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
            <div className="flex items-center justify-center gap-2 border-t border-border/50 pt-4 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-solana-green" />
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
