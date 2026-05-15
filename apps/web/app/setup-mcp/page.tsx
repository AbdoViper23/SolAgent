"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Monitor,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type OS = "mac" | "linux" | "windows";

const TARBALL_URL =
  "https://github.com/AbdoViper23/SolAgent/releases/download/mcp-v0.1.4/solana-trading-agent-mcp-v0.1.4.tar.gz";

const CONFIG_PATHS: Record<OS, string> = {
  mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
  linux: "~/.config/Claude/claude_desktop_config.json",
  windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
};

function detectOS(): OS {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

const RPC_DEFAULT = "https://api.devnet.solana.com";
const PROGRAM_ID_DEFAULT = "DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb";

export default function SetupMcpPage() {
  const [os, setOs] = React.useState<OS>("mac");
  const [installDir, setInstallDir] = React.useState("~/solagent-mcp");
  const [rpcUrl, setRpcUrl] = React.useState(RPC_DEFAULT);

  React.useEffect(() => {
    setOs(detectOS());
  }, []);

  const installCommand = React.useMemo(() => {
    if (os === "windows") {
      return `mkdir ${installDir} && curl -L ${TARBALL_URL} -o solagent-mcp.tar.gz && tar -xzf solagent-mcp.tar.gz -C ${installDir}`;
    }
    return `mkdir -p ${installDir} && curl -L ${TARBALL_URL} | tar xz -C ${installDir}`;
  }, [os, installDir]);

  const configJson = React.useMemo(() => {
    const nodePath = os === "windows" ? `${installDir}\\dist\\index.js` : `${installDir}/dist/index.js`;
    return JSON.stringify(
      {
        mcpServers: {
          "solana-trading-agent": {
            command: "node",
            args: [nodePath],
            env: {
              SOLANA_RPC_URL: rpcUrl,
              VAULT_PROGRAM_ID: PROGRAM_ID_DEFAULT,
            },
          },
        },
      },
      null,
      2,
    );
  }, [os, installDir, rpcUrl]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="aurora-bg" />
      <div className="bg-grid bg-grid-fade pointer-events-none fixed inset-0 -z-10 opacity-30" />
      <Navbar />

      <main className="container mx-auto max-w-3xl flex-1 px-4 py-10 md:py-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-solana-gradient shadow-xl ring-1 ring-white/10">
              <Terminal className="h-6 w-6 text-white drop-shadow" />
            </div>
            <div className="flex-1">
              <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase tracking-widest">
                Setup wizard · ~60 seconds
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Install the <span className="text-gradient">SolAgent MCP</span>
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Wire the SolAgent MCP into Claude Desktop so Claude can drive your trading vault
                directly. Three short steps — no build tooling needed.
              </p>
            </div>
          </div>

          {/* Step 1: OS */}
          <StepCard step={1} icon={<Monitor className="h-4 w-4" />} title="Pick your platform">
            <div className="grid grid-cols-3 gap-2">
              {(["mac", "linux", "windows"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setOs(opt)}
                  className={
                    "rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-all " +
                    (os === opt
                      ? "border-[#14F195]/50 bg-[#14F195]/10 text-[#14F195]"
                      : "border-border bg-card/30 text-muted-foreground hover:border-border/80 hover:text-foreground")
                  }
                >
                  {opt === "mac" ? "macOS" : opt}
                </button>
              ))}
            </div>
          </StepCard>

          {/* Step 2: install */}
          <StepCard step={2} icon={<Download className="h-4 w-4" />} title="Install the MCP server">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Install directory
              </label>
              <input
                value={installDir}
                onChange={(e) => setInstallDir(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
            </div>
            <CodeBlock code={installCommand} />
            <p className="text-[11px] text-muted-foreground">
              Pulls the v0.1.4 tarball from GitHub Releases. No build step — the dist is precompiled.
            </p>
          </StepCard>

          {/* Step 3: configure */}
          <StepCard step={3} icon={<Settings className="h-4 w-4" />} title="Paste into Claude Desktop config">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Solana RPC URL
              </label>
              <input
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
            </div>
            <Alert>
              <AlertDescription className="font-mono text-xs">
                Open{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  {CONFIG_PATHS[os]}
                </span>{" "}
                — create it if it doesn&apos;t exist — and merge the snippet below.
              </AlertDescription>
            </Alert>
            <CodeBlock code={configJson} lang="json" />
          </StepCard>

          {/* Step 4: verify */}
          <StepCard step={4} icon={<Check className="h-4 w-4" />} title="Restart and verify">
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="font-mono text-[10px] text-[#14F195]">01</span>
                <span>Quit and reopen Claude Desktop. The MCP loads on launch.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[10px] text-[#14F195]">02</span>
                <span>
                  Ask Claude:{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    what Solana tools do you have?
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[10px] text-[#14F195]">03</span>
                <span>
                  Claude should list 9 SolAgent tools — <code className="text-foreground">init_vault</code>,{" "}
                  <code className="text-foreground">deposit_to_vault</code>,{" "}
                  <code className="text-foreground">execute_swap</code>, and friends.
                </span>
              </li>
            </ol>
          </StepCard>

          {/* Closing CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild className="font-medium glow-purple">
              <Link href="/app">
                Back to the app
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <a href="https://github.com/AbdoViper23/SolAgent/blob/main/INSTALL_MCP.md" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Full install guide
              </a>
            </Button>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[#14F195]" />
              <span>9 tools · devnet-ready · no API key required</span>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-md">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#9945FF]/10 text-[#9945FF] ring-1 ring-[#9945FF]/30">
            {icon}
          </div>
          <div>
            <Badge variant="outline" className="mb-1 font-mono text-[10px]">
              Step {step}
            </Badge>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang ?? "shell"}
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-[#14F195]" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-relaxed text-zinc-100">
        {code}
      </pre>
    </div>
  );
}
