/**
 * Вспомогательные функции форматирования для бота.
 */
import { ORDER_STATUSES } from '../orders.js';
import { userTitle } from '../store.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export const money = (v) => `${new Intl.NumberFormat('ru-RU').format(Math.round(v))} ₽`;

export function dateTime(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export function timeOnly(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
}

export function statusLabel(status) {
  const s = ORDER_STATUSES[status];
  return s ? `${s.emoji} ${s.title}` : status;
}

const PAY_LABEL = {
  yookassa: 'Картой онлайн (ЮKassa)',
  invoice: 'Счёт для юрлица',
};

export function paymentLabel(order) {
  const base = PAY_LABEL[order.paymentMethod] || order.paymentMethod;
  const paid = order.paymentStatus === 'paid' ? ' · оплачен' : order.paymentStatus === 'canceled' ? ' · отменён' : ' · не оплачен';
  return base + paid;
}

/** Карточка заказа для админа. */
export function orderCard(order) {
  const items = order.items
    .map((it) => `• ${esc(it.name)} <code>${esc(it.article)}</code> × ${it.qty} — ${money(it.price * it.qty)}`)
    .join('\n');

  const company = order.company
    ? `\n<b>Юрлицо:</b> ${esc(order.company.name)}\nИНН ${esc(order.company.inn)}${order.company.kpp ? ` · КПП ${esc(order.company.kpp)}` : ''}` +
      `${order.company.address ? `\n${esc(order.company.address)}` : ''}` +
      `${order.invoiceNumber ? `\nСчёт № <code>${esc(order.invoiceNumber)}</code>` : ''}`
    : '';

  return [
    `<b>Заказ ${esc(order.number)}</b> · ${statusLabel(order.status)}`,
    `${dateTime(order.createdAt)}`,
    '',
    items,
    '',
    `Товары: ${money(order.subtotal)}${order.shipping ? `\nДоставка: ${money(order.shipping)}` : '\nДоставка: бесплатно'}`,
    `<b>Итого: ${money(order.total)}</b>`,
    '',
    `<b>Клиент:</b> ${esc(order.customer.name)} · ${esc(order.customer.phone)}`,
    order.customer.email ? `E-mail: ${esc(order.customer.email)}` : '',
    `Telegram: ${esc(userTitle(order.userId))} (<code>${order.userId}</code>)`,
    `<b>Доставка:</b> ${esc(order.delivery.methodTitle)}${order.delivery.city ? `, ${esc(order.delivery.city)}` : ''}`,
    order.delivery.address ? `Адрес: ${esc(order.delivery.address)}` : '',
    `<b>Оплата:</b> ${esc(paymentLabel(order))}`,
    order.comment ? `<b>Комментарий:</b> ${esc(order.comment)}` : '',
    company,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Короткая строка заказа для списка. */
export function orderLine(order) {
  return `${ORDER_STATUSES[order.status]?.emoji || '•'} ${order.number} · ${money(order.total)} · ${timeOnly(order.createdAt)}`;
}
