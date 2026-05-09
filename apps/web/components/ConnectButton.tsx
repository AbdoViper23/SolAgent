"use client";
import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, Copy, ExternalLink, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddress, explorerAddressUrl } from "@/lib/utils";

export function ConnectButton() {
  const { setVisible } = useWalletModal();
  const { publicKey, disconnect, connecting, wallet } = useWallet();
  const [mounted, setMounted] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="outline" disabled className="font-medium">
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  if (!publicKey) {
    return (
      <Button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="font-medium"
      >
        <Wallet className="h-4 w-4" />
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  const address = publicKey.toBase58();
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="font-mono text-xs">
          {wallet?.adapter.icon ? (
            <span
              className="h-4 w-4"
              dangerouslySetInnerHTML={{
                __html: `<img src="${wallet.adapter.icon}" alt="${wallet.adapter.name}" class="h-4 w-4 rounded" />`,
              }}
            />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          <span className="tabular-nums">{shortAddress(address)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {wallet?.adapter.name ?? "Connected"}
            </span>
            <span className="font-mono text-xs">
              {shortAddress(address, 6, 6)}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCopy} className="cursor-pointer">
          {copied ? (
            <Check className="text-success" />
          ) : (
            <Copy />
          )}
          {copied ? "Copied!" : "Copy address"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer"
          >
            <ExternalLink />
            View on Explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
