"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ConnectButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false }
);

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#mcp", label: "MCP" },
];

export function Navbar() {
  const pathname = usePathname();
  const isApp = pathname?.startsWith("/app");
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 20 }}
      className={cn(
        "sticky top-0 z-40 w-full transition-all",
        scrolled
          ? "border-b border-border/50 bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="container flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-solana-gradient shadow-lg ring-1 ring-white/10 transition-transform group-hover:scale-105">
            <Sparkles className="h-4 w-4 text-white drop-shadow" />
            <div className="absolute inset-0 rounded-lg bg-solana-gradient opacity-50 blur-md -z-10" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              Vault<span className="text-gradient">.ai</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              MCP × Solana
            </span>
          </div>
          <Badge
            variant="outline"
            className="ml-1 inline-flex border-amber-500/40 bg-amber-500/15 font-mono text-[10px] uppercase tracking-wider text-amber-400"
          >
            Devnet
          </Badge>
        </Link>

        {!isApp && (
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        {isApp && (
          <nav className="hidden items-center gap-5 md:flex">
            <Link
              href="/app"
              className={cn(
                "relative pb-0.5 text-sm font-medium transition-colors",
                pathname === "/app"
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-[#9945FF] after:to-[#14F195]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Vault
            </Link>
            <Link
              href="/app/history"
              className={cn(
                "relative pb-0.5 text-sm font-medium transition-colors",
                pathname === "/app/history"
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-[#9945FF] after:to-[#14F195]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              History
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {isApp ? (
            <ConnectButton />
          ) : (
            <Button asChild className="font-medium glow-purple">
              <Link href="/app">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
