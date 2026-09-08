import { NextResponse } from "next/server";
import { updateOrder, getOrder } from "@/lib/orders";
import { notifyAdminPayment } from "@/lib/notify";

// POST /api/orders/:id/mark-paid — called by payment callbacks and by the
// simulation "pay" page so the flow can be tested without real providers.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const wasPaid = order.paymentStatus === "paid";
  const updated = await updateOrder(id, {
    paymentStatus: "paid",
    status: order.status === "cancelled" ? order.status : "paid",
  });

  if (!wasPaid && updated) {
    try {
      await notifyAdminPayment(updated);
    } catch {}
  }

  return NextResponse.json({ order: updated });
}
