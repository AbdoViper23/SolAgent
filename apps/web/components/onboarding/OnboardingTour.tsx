"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step {
  id: string;
  anchor: string;
  title: string;
  body: string;
  side: "top" | "bottom" | "left" | "right";
}

const STEPS: Step[] = [
  {
    id: "vault",
    anchor: '[data-tour="vault-panel"]',
    title: "This is your Trading Vault",
    body:
      "Deposit SOL or devUSDC. Your funds stay in a PDA you control — the agent can only spend within the limits you set.",
    side: "right",
  },
  {
    id: "swap",
    anchor: '[data-tour="swap-panel"]',
    title: "Aggregated Orca routes",
    body:
      "Type an amount and the swap analyzer picks the best Orca Whirlpool. The MCP can do this for you over voice or chat.",
    side: "left",
  },
  {
    id: "voice",
    anchor: '[data-tour="voice-widget"]',
    title: "Trade by speaking",
    body:
      'Open the voice widget and say "deposit 0.1 SOL" or "swap SOL to USDC". Every trade asks for confirmation before signing.',
    side: "left",
  },
  {
    id: "mcp",
    anchor: '[data-tour="vault-panel"]',
    title: "Install the MCP for Claude Desktop",
    body:
      "Want Claude to drive the vault directly? Install the SolAgent MCP in 60 seconds via the setup wizard.",
    side: "right",
  },
];

const STORAGE_KEY = "solagent.tour.v1";

export function OnboardingTour() {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [active, setActive] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  // Boot: open the tour if the user hasn't seen it before.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Give the dashboard a frame to mount so the anchors exist.
      const t = window.setTimeout(() => setActive(true), 400);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Track the active step's anchor rect (scroll/resize aware).
  React.useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];

    const measure = () => {
      const el = document.querySelector(step.anchor);
      if (el) {
        setAnchorRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } else {
        setAnchorRect(null);
      }
    };

    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active, stepIndex]);

  const finish = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setActive(false);
  }, []);

  const next = () => {
    if (stepIndex >= STEPS.length - 1) {
      finish();
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  const skip = () => finish();

  if (!active || typeof window === "undefined") return null;

  const step = STEPS[stepIndex];
  const placement = computePlacement(anchorRect, step.side);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={step.id}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        style={{
          position: "fixed",
          top: placement.top,
          left: placement.left,
          zIndex: 60,
        }}
        className="w-[300px] rounded-xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-[#9945FF]/30"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-solana-gradient shadow-md">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <button
            onClick={skip}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h4 className="mb-1 text-sm font-semibold tracking-tight">{step.title}</h4>
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <Button size="sm" onClick={next} className="h-7 px-3 text-xs">
            {stepIndex === STEPS.length - 1 ? "Finish" : "Next"}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function computePlacement(
  rect: DOMRect | null,
  side: Step["side"],
): { top: number; left: number } {
  if (typeof window === "undefined") return { top: 80, left: 80 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TOOLTIP_W = 300;
  const TOOLTIP_H = 200;
  const GAP = 12;

  if (!rect) {
    return { top: 100, left: Math.max(20, vw - TOOLTIP_W - 24) };
  }

  let top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
  let left = rect.right + GAP;

  if (side === "left") {
    left = rect.left - TOOLTIP_W - GAP;
  } else if (side === "top") {
    top = rect.top - TOOLTIP_H - GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  } else if (side === "bottom") {
    top = rect.bottom + GAP;
    left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  }

  // Clamp to viewport.
  top = Math.max(16, Math.min(top, vh - TOOLTIP_H - 16));
  left = Math.max(16, Math.min(left, vw - TOOLTIP_W - 16));

  return { top, left };
}
