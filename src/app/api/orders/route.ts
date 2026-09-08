import { NextResponse } from "next/server";
import { createOrder, listOrders, updateOrder } from "@/lib/orders";
import { createGramPayment } from "@/lib/payments/gram";
import { createYookassaPayment } from "@/lib/payments/yookassa";
import { env } from "@/lib/env";
import type { CartLine, Customer, PaymentMethod } from "@/lib/types";
import { notifyAdminOrderPlaced } from "@/lib/notify";

// POST /api/orders  -> place an order
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cart?: CartLine[];
      customer?: Customer;
      paymentMethod?: PaymentMethod;
    };
    if (!body.cart || !Array.isArray(body.cart) || body.cart.length === 0) {
      return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
    }
    if (!body.customer?.name || !body.customer?.phone) {
      return NextResponse.json({ error: "Укажите имя и телефон" }, { status: 400 });
    }
    const method: PaymentMethod =
      body.paymentMethod === "gram" || body.paymentMethod === "yookassa" || body.paymentMethod === "invoice"
        ? body.paymentMethod
        : "invoice";

    const order = await createOrder(body.cart, body.customer, method);
    const returnUrl = `${env.publicUrl}/order/${order.id}`;

    let payUrl: string | undefined;
    if (method === "gram") {
      const r = await createGramPayment({
        amountMinor: order.amountMinor,
        orderId: order.id,
        description: `Заказ №${order.number} — ${order.customer.name}`,
        returnUrl,
      });
      if (!r.success) {
        // keep order but note the failure
        return NextResponse.json(
          { order, payUrl: null, error: r.error ?? "Ошибка оплаты GRM" },
          { status: 200 },
        );
      }
      payUrl = r.payUrl;
      await updateOrder(order.id, { payUrl, paymentRef: r.ref });
    } else if (method === "yookassa") {
      const r = await createYookassaPayment({
        amountMinor: order.amountMinor,
        orderId: order.id,
        description: `Заказ №${order.number} — ${order.customer.name}`,
        returnUrl,
      });
      if (!r.success) {
        return NextResponse.json(
          { order, payUrl: null, error: r.error ?? "Ошибка оплаты ЮKassa" },
          { status: 200 },
        );
      }
      payUrl = r.confirmationUrl;
      await updateOrder(order.id, { payUrl, paymentRef: r.paymentId });
    }

    // Notify the admin in Telegram (best effort).
    try {
      await notifyAdminOrderPlaced(order);
    } catch {}

    return NextResponse.json({ order, payUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/orders (admin/dev): list orders
export async function GET() {
  const orders = await listOrders();
  return NextResponse.json({ orders });
}

// GET single handled under [id]
export const dynamic = "force-dynamic";
