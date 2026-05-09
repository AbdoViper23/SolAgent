import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";

const RESOURCES = [
  { label: "Anchor program", href: "#" },
  { label: "MCP server", href: "#" },
  { label: "x402 services", href: "#" },
];

const PRODUCT = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Launch app", href: "/app" },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-border/50">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-solana-gradient">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold">
                Vault<span className="text-gradient">.ai</span>
              </span>
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              An AI-controlled trading vault on Solana. Daily limits enforced
              on-chain, prices validated against Pyth, swaps routed via Orca.
            </p>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              View on GitHub
            </a>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </h4>
            <ul className="space-y-2 text-sm">
              {PRODUCT.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Built with
            </h4>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>Anchor 0.31</li>
              <li>@orca-so/whirlpools</li>
              <li>Pyth Network</li>
              <li>x402 micropayments</li>
              <li>Model Context Protocol</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-6 text-[11px] text-muted-foreground sm:flex-row">
          <p>
            Devnet only · Not financial advice · Built for the Solana × MCP
            hackathon.
          </p>
          <p className="font-mono">
            <span className="text-solana-purple">●</span> network: devnet
          </p>
        </div>
      </div>
    </footer>
  );
}
