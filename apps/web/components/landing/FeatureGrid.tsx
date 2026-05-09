"use client";
import { motion } from "framer-motion";
import {
  Activity,
  Coins,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: "purple" | "green" | "cyan";
}

const FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    title: "On-chain limits",
    body: "Daily SOL caps, slippage guards, and pool/token whitelists are enforced by the Anchor program — not the UI. The vault fails closed.",
    accent: "purple",
  },
  {
    icon: Sparkles,
    title: "Claude-controlled",
    body: "Tell Claude what to swap. The MCP server bridges intent to chain. After setup, no transaction prompts — just conversation.",
    accent: "green",
  },
  {
    icon: Activity,
    title: "Pyth-validated",
    body: "Every swap re-checks the Pyth oracle on-chain before executing. Stale or skewed prices revert the transaction.",
    accent: "cyan",
  },
  {
    icon: Coins,
    title: "x402-paid services",
    body: "Real-time oracle and route analyzer monetized per call via HTTP 402. A production payment model, not a subscription.",
    accent: "purple",
  },
];

const ACCENT: Record<Feature["accent"], string> = {
  purple: "from-solana-purple/20 to-transparent text-solana-purple",
  green: "from-solana-green/20 to-transparent text-solana-green",
  cyan: "from-solana-cyan/20 to-transparent text-solana-cyan",
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 110, damping: 18 },
  },
};

export function FeatureGrid() {
  return (
    <section
      id="features"
      className="container mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="mx-auto max-w-2xl space-y-3 text-center"
      >
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-solana-purple">
          Why this is different
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
          Built like infrastructure,
          <br />
          used like a chat.
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          The hard guarantees live on Solana. The interface is just words.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {FEATURES.map((f) => (
          <motion.div key={f.title} variants={itemVariants}>
            <FeatureCard {...f} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, body, accent }: Feature) {
  return (
    <Card className="group relative h-full overflow-hidden border-border/60 bg-card/40 backdrop-blur-md transition-all hover:border-border hover:bg-card/60">
      <div
        className={`pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-radial blur-2xl opacity-0 transition-opacity group-hover:opacity-100 ${ACCENT[accent]}`}
      />
      <CardContent className="relative space-y-4 p-6">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-border/60 ${ACCENT[accent]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
