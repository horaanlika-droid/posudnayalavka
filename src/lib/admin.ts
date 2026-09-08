import { readStore, updateStore } from "@/lib/db";
import { getOrder, listOrders, updateOrder, setOrderStatus } from "@/lib/orders";
import { getThreadMessages } from "@/lib/support";
import { tgSend, esc } from "@/lib/tg";
import type { Order, SupportThread } from "@/lib/types";

export const STATUS_FLOW: Order["status"][] = ["new", "confirmed", "paid", "shipped", "completed"];

/** Resolve an order from an id, number or "№" style token. */
export async function resolveOrder(token: string): Promise<Order | null> {
  const t = token.replace(/[№#]/g, "").trim();
  if (!t) return null;
  const byId = await getOrder(t);
  if (byId) return byId;
  const num = Number(t);
  if (!Number.isNaN(num)) {
    const all = await listOrders();
    return all.find((o) => o.number === num) ?? null;
  }
  return null;
}

/** Deliver an order message + inline "advance status" buttons to admin chat. */
export async function sendOrderCard(chatId: number, order: Order): Promise<void> {
  const title = `📦 Заказ №${order.number}`;
  const lines = [
    title,
    `Статус: <b>${STATUS_LABEL[order.status]}</b>`,
    `Оплата: ${PAY_LABEL[order.paymentMethod]} · ${order.paymentStatus === "paid" ? "оплачено ✅" : order.paymentMethod === "invoice" ? "счёт" : "ожидание"}`,
    "",
    ...order.items.map(
      (i) => `${esc(i.title)}${i.variantLabel ? ` (${esc(i.variantLabel)})` : ""} × ${i.qty}`,
    ),
    "",
    `<b>Сумма:</b> ${(order.amountMinor / 100).toFixed(2)} ₽`,
    `👤 ${esc(order.customer.name)} ${order.customer.phone ? "· " + esc(order.customer.phone) : ""}`,
  ];
  if (order.customer.isLegalEntity && order.customer.orgDetails) {
    lines.push(`🏢 Юр.лицо: ${esc(order.customer.orgDetails.name ?? "")} · ИНН ${esc(order.customer.orgDetails.inn ?? "")}`);
  }
  if (order.customer.delivery) lines.push(`📍 ${esc(order.customer.delivery)}`);
  if (order.customer.comment) lines.push(`💬 ${esc(order.customer.comment)}`);

  const kb = {
    inline_keyboard: [
      [
        { text: "⬆️ Дальше по статусу", callback_data: `st:${order.id}:next` },
        { text: "❌ Отменить", callback_data: `st:${order.id}:cancelled` },
      ],
    ],
  };
  await tgSend(chatId, lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

/** Advance an order through the happy path, or apply a specific status. */
export async function advanceOrder(orderId: string, target?: Order["status"]): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  if (target) {
    return setOrderStatus(orderId, target);
  }
  const idx = STATUS_FLOW.indexOf(order.status);
  const nextStatus = STATUS_FLOW[idx + 1];
  if (!nextStatus) return order; // already final (completed/cancelled)
  return setOrderStatus(orderId, nextStatus);
}

export const STATUS_LABEL: Record<string, string> = {
  new: "🆕 Новый",
  confirmed: "✅ Подтверждён",
  paid: "💳 Оплачен",
  shipped: "🚚 Отправлен",
  completed: "🏁 Завершён",
  cancelled: "❌ Отменён",
};

export const PAY_LABEL: Record<string, string> = {
  gram: "GRAM",
  yookassa: "ЮKassa",
  invoice: "Счёт юр.лицу",
};

/** Build a formatted list of open orders for /orders */
export async function adminOrdersText(): Promise<string> {
  const orders = await listOrders();
  const active = orders.filter((o) => !["cancelled", "completed"].includes(o.status));
  if (active.length === 0) return "Нет активных заказов.";
  const lines = active.map((o) => {
    return `№${o.number} · ${STATUS_LABEL[o.status]} · ${(o.amountMinor / 100).toFixed(2)} ₽ · ${esc(o.customer.name)}`;
  });
  return `Активные заказы (${active.length}):\n\n${lines.join("\n")}`;
}

/** Inbox helper: return the web thread associated with a Telegram message id. */
export async function threadForMessage(messageId: number): Promise<string | null> {
  const doc = await readStore();
  const inbox = (doc.meta.supportInbox as Record<string, string>) ?? {};
  return inbox[String(messageId)] ?? null;
}

/** Deliver a support message from the web to the admin as a reply that can be answered. */
export async function deliverSupportMessageToAdmin(threadId: string, text: string): Promise<void> {
  const doc = await readStore();
  const thread = doc.supportThreads[threadId] as SupportThread | undefined;
  const name = thread?.customerName ? ` (${esc(thread.customerName)})` : "";
  await tgSend(
    Number(process.env.ADMIN_ID ?? 0),
    `💬 Сообщение из чата поддержки${name}\n\n${esc(text)}`,
    { parse_mode: "HTML" },
  );
}

export { getThreadMessages };
