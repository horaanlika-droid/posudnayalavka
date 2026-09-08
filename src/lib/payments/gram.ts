import { env } from "@/lib/env";
import type { Money } from "@/lib/types";

// GRM (Gram) wallet integration.
//
// Gram has several wallet/merchant providers and each exposes slightly
// different APIs. This module isolates that behind ONE function so you can
// adapt it to your exact provider without touching the rest of the app.
//
// Fill env on the host: GRM_API_BASE, GRM_API_KEY, GRM_RECEIVER.
// If they are empty we run in SIMULATION and return a fake pay URL.

export interface GramCreateInput {
  amountMinor: Money;
  orderId: string;
  description: string;
  returnUrl: string;
}

export interface GramPaymentResult {
  success: boolean;
  /** URL the user should be opened to approve the transfer in their Gram app. */
  payUrl?: string;
  /** Provider transaction id / ref used for lookup later. */
  ref?: string;
  error?: string;
}

/**
 * Create a GRM payment. Adapt `fetch`/URL construction to your wallet's API.
 * A typical Gram merchant flow (example):
 *
 *   POST {grmApiBase}/payments
 *   headers: { Authorization: Bearer {grmApiKey} }
 *   body: { amount_minor, currency, merchant: grmReceiver, order_id, ... }
 *   -> { pay_url, payment_id }
 */
export async function createGramPayment(input: GramCreateInput): Promise<GramPaymentResult> {
  if (!env.grmApiBase || !env.grmReceiver) {
    // ---- SIMULATION MODE ----
    return {
      success: true,
      payUrl: `${env.publicUrl}/pay/simulate?ref=${encodeURIComponent(input.orderId)}&ok=1`,
      ref: `sim-${input.orderId}`,
    };
  }

  try {
    const res = await fetch(`${env.grmApiBase}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.grmApiKey}`,
      },
      body: JSON.stringify({
        amount_minor: input.amountMinor,
        currency: env.currency,
        merchant: env.grmReceiver,
        order_id: input.orderId,
        description: input.description,
        return_url: input.returnUrl,
      }),
    });
    const data = (await res.json()) as { pay_url?: string; payment_id?: string; id?: string };
    if (!res.ok || !data.pay_url) {
      return { success: false, error: `GRAM ${res.status}: ${JSON.stringify(data)}` };
    }
    return { success: true, payUrl: data.pay_url, ref: data.payment_id ?? data.id };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
