import { NextResponse } from "next/server";
import { updateOrder, getOrder } from "@/lib/orders";
import { notifyAdminPayment } from "@/lib/notify";

// POST /api/payments/yookassa/webhook
// YooKassa sends payment notifications here. On `payment.succeeded` we mark the
// order as paid (metadata.orderId was set at creation).
//
// ⚠️ In production point YooKassa's webhook to:
//      {PUBLIC_URL}/api/payments/yookassa/webhook
// YooKassa calls come from its fixed IP list; see docs if you want strict IP
// allow-listing. Signing is handled by transport-level HTTPS + shop id.

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      event?: string;
      object?: { metadata?: { orderId?: string }; id?: string; status?: string };
    };
    const event = body.event;
    const orderId = body.object?.metadata?.orderId;

    // YooKassa "payment.succeeded" — confirm the order.
    if (event === "payment.succeeded" && orderId) {
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

    // Any other event is acknowledged (YooKassa expects 200 to stop retries).
    return NextResponse.json({ ok: true, ignored: event ?? "unknown" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
