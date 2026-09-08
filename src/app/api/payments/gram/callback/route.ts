import { NextResponse } from "next/server";
import { updateOrder, getOrder } from "@/lib/orders";
import { notifyAdminPayment } from "@/lib/notify";

// POST /api/payments/gram/callback
// Webhook/callback endpoint for the GRM wallet provider.
//
// ⚠️ GRM providers differ in payload shape. This endpoint accepts several common
//    conventions ({orderId|order_id|ref} in query or JSON) and marks the order
//    paid. When you plug your real GRM API in src/lib/payments/gram.ts, adapt
//    the field parsing here to your provider's callback and ideally verify the
//    request signature before marking paid.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const candidates = [
    url.searchParams.get("orderId"),
    url.searchParams.get("order_id"),
    url.searchParams.get("ref"),
  ];

  let orderId: string | undefined;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {}

  const fromBody = [body.orderId, body.order_id, body.ref, body.order]
    .filter((v): v is string => typeof v === "string");
  orderId = [...(candidates as (string | null)[]), ...fromBody].filter(
    (v): v is string => !!v,
  )[0];

  if (!orderId) {
    return NextResponse.json({ error: "order id not found in request" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const wasPaid = order.paymentStatus === "paid";
  const updated = await updateOrder(orderId, {
    paymentStatus: "paid",
    status: order.status === "cancelled" ? order.status : "paid",
  });
  if (!wasPaid && updated) {
    try {
      await notifyAdminPayment(updated);
    } catch {}
  }
  return NextResponse.json({ ok: true });
}
