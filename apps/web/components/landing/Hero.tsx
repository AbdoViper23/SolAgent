"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroLiveCard } from "./HeroLiveCard";
import { GithubIcon } from "@/components/icons/GithubIcon";

const SPRING = { type: "spring" as const, stiffness: 120, damping: 18 };

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-32">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start space-y-7">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.05 }}
            >
              <Badge
                variant="outline"
                className="gap-1.5 border-solana-purple/30 bg-solana-purple/10 px-3 py-1 font-mono text-[11px] text-foreground/90"
              >
                <Sparkles className="h-3 w-3 text-solana-purple" />
                Powered by Claude · Solana devnet
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.15 }}
              className="text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
            >
              Trade Solana
              <br />
              in <span className="text-gradient">plain English.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.25 }}
              className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
            >
              Your AI agent executes swaps directly on-chain — within the
              limits you set, validated against Pyth oracles, routed through
              Orca Whirlpools. No manual approvals.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.35 }}
              className="flex flex-wrap items-center gap-3"
            >
              <Button asChild size="lg" className="font-medium glow-purple">
                <Link href="/app">
                  Launch App
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="font-medium">
                <a
                  href="https://github.com/Abdoviper23/SolAgent"
                  target="_blank"
                  rel="noreferrer"
                >
                  <GithubIcon className="h-4 w-4" />
                  View on GitHub
                </a>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.6 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 font-mono text-[11px] text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-solana-purple" />
                Anchor 0.31 program
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-solana-green" />
                10 MCP tools
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-solana-cyan" />
                x402 paid services
              </span>
            </motion.div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <HeroLiveCard />
          </div>
        </div>
      </div>
    </section>
  );
}
