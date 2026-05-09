"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Sparkles, Terminal, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MCP_TOOLS = [
  { name: "get_vault_info", group: "vault" },
  { name: "init_vault", group: "vault" },
  { name: "deposit_to_vault", group: "vault" },
  { name: "withdraw_from_vault", group: "vault" },
  { name: "update_vault_config", group: "vault" },
  { name: "get_best_quote", group: "trade" },
  { name: "execute_swap", group: "trade" },
  { name: "analyze_routes", group: "trade" },
  { name: "get_sol_price", group: "data" },
  { name: "send_token", group: "transfer" },
];

const GROUP_COLORS: Record<string, string> = {
  vault: "border-solana-purple/30 bg-solana-purple/10 text-solana-purple",
  trade: "border-solana-green/30 bg-solana-green/10 text-solana-green",
  data: "border-solana-cyan/30 bg-solana-cyan/10 text-solana-cyan",
  transfer: "border-warning/30 bg-warning/10 text-warning",
};

export function MCPShowcase() {
  return (
    <section
      id="mcp"
      className="container mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="mx-auto max-w-2xl space-y-3 text-center"
      >
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-solana-cyan">
          MCP integration
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
          10 MCP tools. <span className="text-gradient">One vault.</span>
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          The Model Context Protocol server exposes the vault to Claude
          Desktop. Natural language goes in, signed transactions come out.
        </p>
      </motion.div>

      <div className="mt-14 grid gap-6 lg:grid-cols-5">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 110, damping: 18 }}
          className="lg:col-span-3"
        >
          <ChatPreview />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{
            type: "spring",
            stiffness: 110,
            damping: 18,
            delay: 0.1,
          }}
          className="lg:col-span-2"
        >
          <ToolsList />
        </motion.div>
      </div>
    </section>
  );
}

function ChatPreview() {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (reduce) {
      setStep(3);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep(1), 600));
    timers.push(setTimeout(() => setStep(2), 1700));
    timers.push(setTimeout(() => setStep(3), 2900));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  return (
    <Card className="h-full overflow-hidden border-border/60 bg-card/40 backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-border/50 bg-background/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        </div>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          claude desktop · vault.ai mcp
        </span>
      </div>

      <CardContent className="space-y-4 p-6">
        <ChatBubble role="user" show={step >= 0}>
          Swap 1 SOL to devUSDC, best route on Orca.
        </ChatBubble>

        <ChatBubble role="assistant" show={step >= 1}>
          <p>
            Calling{" "}
            <span className="font-mono text-solana-cyan">get_best_quote</span>…
          </p>
          <p className="text-muted-foreground">
            SOL/USDC · Orca pool 8sLb…ZxqA · est. 187.42 USDC · 0.21% slip.
          </p>
        </ChatBubble>

        <ChatBubble role="assistant" show={step >= 2}>
          <p>
            Within your daily limit. Executing{" "}
            <span className="font-mono text-solana-purple">execute_swap</span>…
          </p>
        </ChatBubble>

        <ChatBubble role="assistant" show={step >= 3}>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-solana-green" />
            <div className="space-y-1">
              <p>Filled at $187.42 · 0.21% slippage.</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                tx 5kQp…vN3a · pyth verified · daily used 1.0 / 5.0 SOL
              </p>
            </div>
          </div>
        </ChatBubble>
      </CardContent>
    </Card>
  );
}

function ChatBubble({
  role,
  show,
  children,
}: {
  role: "user" | "assistant";
  show: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`flex items-start gap-3 ${isUser ? "" : "pl-2"}`}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
          isUser
            ? "bg-secondary text-foreground"
            : "bg-solana-gradient text-white"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="flex-1 space-y-1 text-sm leading-relaxed">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {isUser ? "you" : "claude"}
        </p>
        <div className="text-foreground/90">{children}</div>
      </div>
    </motion.div>
  );
}

function ToolsList() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-card/40 p-1 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            tools/list
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          10
        </Badge>
      </div>
      <div className="flex-1 space-y-1.5 px-2 pb-3">
        {MCP_TOOLS.map((tool, i) => (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, x: 8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
            className="flex items-center justify-between rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border/60 hover:bg-background/40"
          >
            <span className="font-mono text-xs text-foreground/90">
              {tool.name}
            </span>
            <Badge
              variant="outline"
              className={`font-mono text-[9px] uppercase ${GROUP_COLORS[tool.group]}`}
            >
              {tool.group}
            </Badge>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
