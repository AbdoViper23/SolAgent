import {
  paymentMiddlewareFromConfig,
  type SchemeRegistration,
} from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const SOLANA_DEVNET_CAIP2: Network = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const USDC_DEVNET_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export interface StreamPaymentConfig {
  merchantAddress: string;
  facilitatorUrl: string;
  priceAtomicUnits: string;
  initRoutePath: string;
}

export function buildStreamPaymentMiddleware(cfg: StreamPaymentConfig) {
  const facilitator = new HTTPFacilitatorClient({ url: cfg.facilitatorUrl });

  const routes: RoutesConfig = {
    [`POST ${cfg.initRoutePath}`]: {
      accepts: {
        scheme: "exact",
        payTo: cfg.merchantAddress,
        price: { asset: USDC_DEVNET_ADDRESS, amount: cfg.priceAtomicUnits },
        network: SOLANA_DEVNET_CAIP2,
      },
      description:
        "Open a 60-second WebSocket subscription that streams the freshest Orca multi-pool best quote",
    },
  };

  const schemes: SchemeRegistration[] = [
    { network: SOLANA_DEVNET_CAIP2, server: new ExactSvmScheme() },
  ];

  return paymentMiddlewareFromConfig(routes, facilitator, schemes);
}
