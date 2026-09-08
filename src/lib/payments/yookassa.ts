import { env } from "@/lib/env";
import type { Money } from "@/lib/types";

// YooKassa integration.
// Configure env: YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY.
// Empty => SIMULATION MODE.

const YOOKASSA_API = "https://api.yookassa.ru/v3";

export interface YookassaCreateInput {
  amountMinor: Money;
  orderId: string;
  description: string;
  returnUrl: string;
}

export interface YookassaResult {
  success: boolean;
  confirmationUrl?: string;
  paymentId?: string;
  error?: string;
}

export async function createYookassaPayment(input: YookassaCreateInput): Promise<YookassaResult> {
  if (!env.yookassaShopId || !env.yookassaSecretKey) {
    return {
      success: true,
      confirmationUrl: `${env.publicUrl}/pay/simulate?ref=${encodeURIComponent(input.orderId)}&ok=1`,
      paymentId: `sim-${input.orderId}`,
    };
  }

  const body = {
    amount: {
      value: (input.amountMinor / 100).toFixed(2),
      currency: env.currency,
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: input.returnUrl,
    },
    description: input.description.slice(0, 128),
    metadata: { orderId: input.orderId },
  };

  const auth = "Basic " + Buffer.from(`${env.yookassaShopId}:${env.yookassaSecretKey}`).toString("base64");

  try {
    const res = await fetch(`${YOOKASSA_API}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": input.orderId,
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      id?: string;
      confirmation?: { confirmation_url?: string };
      status?: string;
    };
    if (!res.ok || data.status === "canceled") {
      return { success: false, error: `YooKassa ${res.status}: ${JSON.stringify(data)}` };
    }
    return {
      success: true,
      paymentId: data.id,
      confirmationUrl: data.confirmation?.confirmation_url,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
