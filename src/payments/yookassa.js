/**
 * ЮKassa: создание платежа и проверка статуса.
 * shopId и секретный ключ читаются только из переменных окружения.
 * Документация: https://yookassa.ru/developers/api
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const API = 'https://api.yookassa.ru/v3';

function authHeader() {
  const token = Buffer.from(`${config.yookassa.shopId}:${config.yookassa.secretKey}`).toString('base64');
  return `Basic ${token}`;
}

async function request(path, { method = 'GET', body, idempotenceKey } = {}) {
  if (!config.yookassa.enabled) throw new Error('ЮKassa не настроена');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.description || json?.code || `HTTP ${res.status}`;
    throw new Error(`ЮKassa: ${message}`);
  }
  return json;
}

function buildReceipt(order) {
  if (!config.yookassa.receipt) return undefined;
  const customer = {};
  if (order.customer?.email) customer.email = order.customer.email;
  if (order.customer?.phone) customer.phone = order.customer.phone.replace(/[^\d+]/g, '');
  if (!customer.email && !customer.phone) return undefined;

  const items = order.items.map((it) => ({
    description: `${it.name} (арт. ${it.article})`.slice(0, 128),
    quantity: String(it.qty),
    amount: { value: it.price.toFixed(2), currency: 'RUB' },
    vat_code: config.yookassa.vatCode,
    payment_mode: 'full_payment',
    payment_subject: 'commodity',
  }));
  if (order.shipping > 0) {
    items.push({
      description: 'Доставка',
      quantity: '1',
      amount: { value: order.shipping.toFixed(2), currency: 'RUB' },
      vat_code: config.yookassa.vatCode,
      payment_mode: 'full_payment',
      payment_subject: 'service',
    });
  }
  return { customer, items };
}

/** Создаёт платёж и возвращает ссылку на оплату. */
export async function createPayment(order, { returnUrl }) {
  const payload = {
    amount: { value: order.total.toFixed(2), currency: 'RUB' },
    capture: true,
    description: `Заказ ${order.number} · Посудная лавка`.slice(0, 128),
    confirmation: { type: 'redirect', return_url: returnUrl },
    metadata: { orderId: order.id, orderNumber: order.number, userId: String(order.userId) },
    receipt: buildReceipt(order),
  };
  const payment = await request('/payments', {
    method: 'POST',
    body: payload,
    idempotenceKey: crypto.randomUUID(),
  });
  return {
    id: payment.id,
    status: payment.status,
    confirmationUrl: payment.confirmation?.confirmation_url || '',
    paid: Boolean(payment.paid),
  };
}

export async function getPayment(paymentId) {
  const payment = await request(`/payments/${paymentId}`);
  return {
    id: payment.id,
    status: payment.status, // pending | waiting_for_capture | succeeded | canceled
    paid: Boolean(payment.paid),
    amount: Number(payment.amount?.value || 0),
    method: payment.payment_method?.title || payment.payment_method?.type || '',
    cancellationReason: payment.cancellation_details?.reason || '',
  };
}

/** Возврат средств (используется админом из бота). */
export async function refundPayment(paymentId, amount) {
  return request('/refunds', {
    method: 'POST',
    idempotenceKey: crypto.randomUUID(),
    body: {
      payment_id: paymentId,
      amount: { value: Number(amount).toFixed(2), currency: 'RUB' },
    },
  });
}
