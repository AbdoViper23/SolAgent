import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

export interface X402ClientOptions {
  baseURL: string;
  privateKeyBase58: string;
}

export async function createX402Client(opts: X402ClientOptions) {
  const keyBytes = base58.decode(opts.privateKeyBase58);
  const signer = await createKeyPairSignerFromBytes(keyBytes);
  const client = new x402Client();
  registerExactSvmScheme(client, { signer });
  return wrapAxiosWithPayment(
    axios.create({ baseURL: opts.baseURL }),
    client
  );
}

export { x402Client, wrapAxiosWithPayment };
