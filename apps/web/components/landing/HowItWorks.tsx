"use client";
import { motion } from "framer-motion";

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Connect wallet",
    body: "Phantom, Solflare, or Backpack on Solana devnet. Single click, no email.",
  },
  {
    n: "02",
    title: "Initialize vault",
    body: "Create your per-user PDA. Set your daily SOL spend limit and slippage tolerance.",
  },
  {
    n: "03",
    title: "Deposit funds",
    body: "Send SOL or devUSDC into the vault. You can withdraw anytime — keys stay yours.",
  },
  {
    n: "04",
    title: "Talk to Claude",
    body: "Open Claude Desktop, the MCP server is wired in. Say what you want to swap.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const stepVariants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 110, damping: 18 },
  },
};

export function HowItWorks() {
  return (
    <section
      id="how"
      className="relative scroll-mt-20 overflow-hidden py-20 md:py-28"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="mx-auto max-w-2xl space-y-3 text-center"
        >
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-solana-green">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Four steps. Then talk to Claude.
          </h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mt-16"
        >
          <div className="pointer-events-none absolute left-0 right-0 top-[18px] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />

          <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
            {STEPS.map((step) => (
              <motion.div
                key={step.n}
                variants={stepVariants}
                className="relative flex flex-col items-start gap-3"
              >
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-background ring-1 ring-border">
                  <span className="font-mono text-[11px] font-semibold text-gradient">
                    {step.n}
                  </span>
                  <span className="absolute inset-0 rounded-full bg-solana-gradient opacity-20 blur-md" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
