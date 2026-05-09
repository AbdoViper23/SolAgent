"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="container mx-auto max-w-6xl px-4 py-20 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 110, damping: 18 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-10 backdrop-blur-xl md:p-16"
      >
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-50" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-solana-purple to-transparent" />

        <div className="relative flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Ready to let{" "}
            <span className="text-gradient">Claude trade for you?</span>
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Initialize your vault on devnet in under a minute. Set your
            limits. Then talk.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild size="lg" className="font-medium glow-purple">
              <Link href="/app">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href="#how">Read how it works</a>
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
