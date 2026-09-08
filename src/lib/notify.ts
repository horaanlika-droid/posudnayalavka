import { env } from "@/lib/env";
import { tgSend, esc } from "@/lib/tg";
import { updateStore, readStore } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import type { Order } from "@/lib/types";

const PAY_LABEL: Record<string, string> = {
  gram: "GRAM",
  yookassa: "ЮKassa",
  invoice: "Счёт для юр.лица",
};
const STATUS_LABEL: Record<string, string> = {
  new: "🆕 Новый",
  confirmed: "✅ Подтверждён",
  paid: "💳 Оплачен",
  shipped: "🚚 Отправлен",
  completed: "🏁 Завершён",
  cancelled: "❌ Отменён",
};

export function formatOrder(order: Order): string {
  const items = order.items
    .map((i) => `${esc(i.title)}${i.variantLabel ? ` (${esc(i.variantLabel)})` : ""} × ${i.qty} — ${formatMoney(i.priceMinor * i.qty)}`)
    .join("\n");
  const c = order.customer;
  const header = `📦 <b>Заказ №${order.number}</b> · ${STATUS_LABEL[order.status]}`;
  const lines = [
    header,
    "",
    items,
    "",
    `💰 <b>Итого:</b> ${formatMoney(order.amountMinor)}`,
    `💳 Оплата: ${PAY_LABEL[order.paymentMethod] ?? order.paymentMethod}`,
    "",
    `👤 ${esc(c.name)}`,
    c.phone ? `📞 ${esc(c.phone)}` : null,
    c.email ? `✉️ ${esc(c.email)}` : null,
    c.isLegalEntity && c.orgDetails?.name ? `🏢 Юр.лицо: ${esc(c.orgDetails.name)} (ИНН ${esc(c.orgDetails.inn ?? "—")})` : null,
    c.delivery ? `📍 ${esc(c.delivery)}` : null,
    c.comment ? `💬 ${esc(c.comment)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return lines;
}

/** Send a support/new-thread event to the admin DM. Records the mapping so a
 *  Telegram reply from the admin routes back to the web thread. */
async function relayToAdmin(
  text: string,
  threadId: string,
): Promise<void> {
  const res = await tgSend(env.adminId, text, { parse_mode: "HTML" });
  if (res.ok && res.message_id) {
    await updateStore((doc) => {
      const inbox = (doc.meta.supportInbox as Record<string, string>) ?? {};
      inbox[String(res.message_id)] = threadId;
      doc.meta.supportInbox = inbox;
    });
  }
}

export async function notifyAdminOrderPlaced(order: Order): Promise<void> {
  await tgSend(
    env.adminId,
    `${formatOrder(order)}\n\nСоздан на сайте. Ответить можно здесь через бота.`,
    { parse_mode: "HTML" },
  );
}

export async function notifyAdminPayment(order: Order): Promise<void> {
  await tgSend(
    env.adminId,
    `✅ <b>Заказ №${order.number} оплачен</b>\n${formatMoney(order.amountMinor)} · ${order.customer.name}`,
    { parse_mode: "HTML" },
  );
}

export async function notifyAdminNewThread(
  threadId: string,
  customerName?: string,
  orderId?: string,
): Promise<void> {
  await tgSend(
    env.adminId,
    `💬 Новый чат поддержки${customerName ? ` от <b>${esc(customerName)}</b>` : ""}${orderId ? ` (заказ #${esc(orderId)})` : ""}\nОтвечайте через бота.`,
    { parse_mode: "HTML" },
  );
}

export async function notifySupportUserMessage(threadId: string, text: string): Promise<void> {
  const doc = await readStore();
  const thread = (doc.supportThreads[threadId] as { customerName?: string } | undefined) ?? {};
  const name = thread.customerName ? ` — ${esc(thread.customerName)}` : "";
  await relayToAdmin(
    `💬 Сообщение из чата${name}\n\n${esc(text)}\n\n<i>Напишите ответ реплаем на это сообщение.</i>`,
    threadId,
  );
}
