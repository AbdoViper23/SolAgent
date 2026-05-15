"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { mockStore } from "./mockVaultStore";

interface DemoModeContextValue {
  isDemoMode: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

const DemoModeContext = React.createContext<DemoModeContextValue | null>(null);

const STORAGE_KEY = "solagent.demoMode";

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = React.useState(false);
  const router = useRouter();

  // Re-hydrate from sessionStorage on mount (demo state is session-scoped).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "1") setIsDemoMode(true);
  }, []);

  const enterDemo = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    }
    mockStore.reset();
    setIsDemoMode(true);
    router.push("/app");
  }, [router]);

  const exitDemo = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    mockStore.reset();
    setIsDemoMode(false);
    router.push("/");
  }, [router]);

  const value = React.useMemo(
    () => ({ isDemoMode, enterDemo, exitDemo }),
    [isDemoMode, enterDemo, exitDemo],
  );

  return (
    <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = React.useContext(DemoModeContext);
  if (!ctx) throw new Error("useDemoMode must be used inside <DemoModeProvider>");
  return ctx;
}
