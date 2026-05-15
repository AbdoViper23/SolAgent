"use client";
import { useSyncExternalStore } from "react";

export interface MockHistoryEntry {
  id: string;
  type: "init" | "deposit" | "withdraw" | "swap" | "send";
  description: string;
  timestamp: number;
}

export interface MockVaultState {
  initialized: boolean;
  walletSolBalance: number;
  walletUsdcBalance: number;
  vaultSolBalance: number;
  vaultUsdcBalance: number;
  dailyLimitSol: number;
  dailyLimitUsedSol: number;
  slippageBps: number;
  history: MockHistoryEntry[];
}

const INITIAL_STATE: MockVaultState = {
  initialized: false,
  walletSolBalance: 5.0,
  walletUsdcBalance: 1_250,
  vaultSolBalance: 0,
  vaultUsdcBalance: 0,
  dailyLimitSol: 1.0,
  dailyLimitUsedSol: 0,
  slippageBps: 100,
  history: [],
};

let state: MockVaultState = { ...INITIAL_STATE, history: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(updater: (prev: MockVaultState) => MockVaultState) {
  state = updater(state);
  emit();
}

function uid() {
  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushHistory(entry: Omit<MockHistoryEntry, "id" | "timestamp">) {
  setState((s) => ({
    ...s,
    history: [
      { id: uid(), timestamp: Date.now(), ...entry },
      ...s.history,
    ].slice(0, 50),
  }));
}

export const mockStore = {
  getSnapshot: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  reset: () => {
    state = { ...INITIAL_STATE, history: [] };
    emit();
  },
};

export const mockActions = {
  initVault: async () => {
    await delay(450);
    if (state.initialized) return;
    setState((s) => ({ ...s, initialized: true }));
    pushHistory({ type: "init", description: "Initialized vault (demo)" });
  },
  deposit: async (token: "SOL" | "devUSDC", amount: number) => {
    await delay(500);
    if (!state.initialized) {
      setState((s) => ({ ...s, initialized: true }));
      pushHistory({ type: "init", description: "Initialized vault (demo)" });
    }
    if (token === "SOL") {
      if (state.walletSolBalance < amount) throw new Error("Insufficient SOL");
      setState((s) => ({
        ...s,
        walletSolBalance: round(s.walletSolBalance - amount, 6),
        vaultSolBalance: round(s.vaultSolBalance + amount, 6),
      }));
    } else {
      if (state.walletUsdcBalance < amount) throw new Error("Insufficient devUSDC");
      setState((s) => ({
        ...s,
        walletUsdcBalance: round(s.walletUsdcBalance - amount, 2),
        vaultUsdcBalance: round(s.vaultUsdcBalance + amount, 2),
      }));
    }
    pushHistory({ type: "deposit", description: `Deposited ${amount} ${token} (demo)` });
  },
  withdraw: async (token: "SOL" | "devUSDC", amount: number) => {
    await delay(500);
    if (token === "SOL") {
      if (state.vaultSolBalance < amount) throw new Error("Insufficient vault SOL");
      setState((s) => ({
        ...s,
        vaultSolBalance: round(s.vaultSolBalance - amount, 6),
        walletSolBalance: round(s.walletSolBalance + amount, 6),
      }));
    } else {
      if (state.vaultUsdcBalance < amount) throw new Error("Insufficient vault devUSDC");
      setState((s) => ({
        ...s,
        vaultUsdcBalance: round(s.vaultUsdcBalance - amount, 2),
        walletUsdcBalance: round(s.walletUsdcBalance + amount, 2),
      }));
    }
    pushHistory({ type: "withdraw", description: `Withdrew ${amount} ${token} (demo)` });
  },
  swap: async (
    fromToken: "SOL" | "devUSDC",
    toToken: "SOL" | "devUSDC",
    amountIn: number,
    rate: number,
  ) => {
    await delay(650);
    const amountOut = round(amountIn * rate, toToken === "SOL" ? 6 : 2);
    if (fromToken === "SOL") {
      if (state.vaultSolBalance < amountIn) throw new Error("Insufficient vault SOL");
      setState((s) => ({
        ...s,
        vaultSolBalance: round(s.vaultSolBalance - amountIn, 6),
        vaultUsdcBalance: round(s.vaultUsdcBalance + amountOut, 2),
        dailyLimitUsedSol: round(s.dailyLimitUsedSol + amountIn, 6),
      }));
    } else {
      if (state.vaultUsdcBalance < amountIn) throw new Error("Insufficient vault devUSDC");
      setState((s) => ({
        ...s,
        vaultUsdcBalance: round(s.vaultUsdcBalance - amountIn, 2),
        vaultSolBalance: round(s.vaultSolBalance + amountOut, 6),
      }));
    }
    pushHistory({
      type: "swap",
      description: `Swapped ${amountIn} ${fromToken} → ${amountOut.toFixed(toToken === "SOL" ? 4 : 2)} ${toToken} (demo)`,
    });
    return amountOut;
  },
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function round(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function useMockVault(): MockVaultState {
  return useSyncExternalStore(
    mockStore.subscribe,
    mockStore.getSnapshot,
    mockStore.getSnapshot,
  );
}

// A deterministic public key shape for demo mode — base58, 32 bytes.
// We don't use this as a real on-chain key; it just keeps types happy.
export const MOCK_WALLET_ADDRESS = "DEMo1111111111111111111111111111111111111111";
export const MOCK_VAULT_ADDRESS = "DEMov1111111111111111111111111111111111111";
