/**
 * Заказы: расчёт сумм, создание, статусы.
 */
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, save, nextId, getUser } from './store.js';
import { findProduct } from './catalog.js';
import { events } from './events.js';
import { nextInvoiceNumber } from './payments/invoice.js';

export const ORDER_STATUSES = {
  new: { title: 'Новый', emoji: '🆕' },
  awaiting_payment: { title: 'Ждёт оплаты', emoji: '⏳' },
  paid: { title: 'Оплачен', emoji: '✅' },
  packing: { title: 'Собирается', emoji: '📦' },
  shipped: { title: 'Отправлен', emoji: '🚚' },
  done: { title: 'Доставлен', emoji: '🎉' },
  canceled: { title: 'Отменён', emoji: '❌' },
};

export const DELIVERY_METHODS = {
  courier_msk: { title: 'Курьер по Москве', free: true },
  courier_spb: { title: 'Курьер по Санкт-Петербургу', free: true },
  cdek: { title: 'СДЭК / ПЭК по России', free: false },
  pickup: { title: 'Самовывоз', free: true },
};

export function shippingCost(subtotal, method) {
  const m = DELIVERY_METHODS[method];
  if (!m || m.free) return 0;
  if (subtotal >= config.shop.freeShippingFrom) return 0;
  return config.shop.shippingCost;
}

/** Пересчитывает корзину по актуальным ценам каталога. */
export function normalizeItems(rawItems) {
  const items = [];
  for (const raw of rawItems || []) {
    const product = findProduct(raw.id);
    if (!product || product.hidden || product.outOfStock) continue;
    const qty = Math.max(1, Math.min(999, Number.parseInt(raw.qty, 10) || 1));
    items.push({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      qty,
      image: product.image,
      volumeLabel: product.volumeLabel,
      category: product.category,
    });
  }
  return items;
}

export function computeTotals(items, deliveryMethod) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping = shippingCost(subtotal, deliveryMethod);
  return { subtotal, shipping, total: subtotal + shipping };
}

export function createOrder({ userId, items, customer, delivery, paymentMethod, company, comment }) {
  const normalized = normalizeItems(items);
  if (!normalized.length) throw new Error('Корзина пуста');
  const { subtotal, shipping, total } = computeTotals(normalized, delivery?.method);
  if (config.shop.minOrderTotal && total < config.shop.minOrderTotal) {
    throw new Error(`Минимальная сумма заказа — ${config.shop.minOrderTotal} ₽`);
  }

  const seq = nextId('order');
  const order = {
    id: crypto.randomUUID(),
    number: `ПЛ-${seq}`,
    userId: Number(userId),
    items: normalized,
    subtotal,
    shipping,
    total,
    customer: {
      name: (customer?.name || '').slice(0, 120),
      phone: (customer?.phone || '').slice(0, 40),
      email: (customer?.email || '').slice(0, 120),
    },
    delivery: {
      method: delivery?.method || 'cdek',
      methodTitle: DELIVERY_METHODS[delivery?.method]?.title || 'Доставка',
      city: (delivery?.city || '').slice(0, 120),
      address: (delivery?.address || '').slice(0, 300),
    },
    company: null,
    comment: (comment || '').slice(0, 500),
    paymentMethod,
    paymentStatus: 'pending',
    status: paymentMethod === 'invoice' ? 'new' : 'awaiting_payment',
    payment: null,
    invoiceNumber: null,
    invoiceKey: null,
    history: [{ at: Date.now(), status: 'new', by: 'user' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (paymentMethod === 'invoice') {
    order.company = {
      name: (company?.name || '').slice(0, 200),
      inn: (company?.inn || '').slice(0, 20),
      kpp: (company?.kpp || '').slice(0, 20),
      address: (company?.address || '').slice(0, 300),
      email: (company?.email || customer?.email || '').slice(0, 120),
    };
    order.invoiceNumber = nextInvoiceNumber();
    order.invoiceKey = crypto.randomBytes(8).toString('hex');
  }

  db.orders.unshift(order);
  const user = getUser(userId);
  if (user) {
    user.ordersCount = (user.ordersCount || 0) + 1;
    user.lastOrderAt = Date.now();
  }
  save();
  events.emit('order:created', order);
  return order;
}

export function getOrder(id) {
  return db.orders.find((o) => o.id === id) || null;
}

export function getOrderByNumber(number) {
  const n = String(number).trim().toUpperCase();
  return db.orders.find((o) => o.number.toUpperCase() === n) || null;
}

export function userOrders(userId) {
  return db.orders.filter((o) => o.userId === Number(userId));
}

export function updateOrder(id, patch, by = 'system') {
  const order = getOrder(id);
  if (!order) return null;
  Object.assign(order, patch, { updatedAt: Date.now() });
  if (patch.status) order.history.push({ at: Date.now(), status: patch.status, by });
  save();
  return order;
}

export function markPaid(order, paymentInfo = {}, by = 'system') {
  if (order.paymentStatus === 'paid') return order;
  order.paymentStatus = 'paid';
  order.paidAt = Date.now();
  order.payment = { ...(order.payment || {}), ...paymentInfo };
  order.status = 'paid';
  order.history.push({ at: Date.now(), status: 'paid', by });
  order.updatedAt = Date.now();
  const user = getUser(order.userId);
  if (user) user.totalSpent = (user.totalSpent || 0) + order.total;
  save();
  events.emit('order:paid', order);
  return order;
}

export function setStatus(order, status, by = 'admin') {
  if (!ORDER_STATUSES[status]) return order;
  order.status = status;
  order.updatedAt = Date.now();
  order.history.push({ at: Date.now(), status, by });
  if (status === 'paid' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    order.paidAt = Date.now();
  }
  save();
  events.emit('order:status', order);
  return order;
}

export function orderStats() {
  const orders = db.orders;
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const dayAgo = Date.now() - 86400000;
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    total: orders.length,
    today: orders.filter((o) => o.createdAt > dayAgo).length,
    week: orders.filter((o) => o.createdAt > weekAgo).length,
    paidCount: paid.length,
    revenue: paid.reduce((s, o) => s + o.total, 0),
    avgCheck: paid.length ? Math.round(paid.reduce((s, o) => s + o.total, 0) / paid.length) : 0,
    open: orders.filter((o) => !['done', 'canceled'].includes(o.status)).length,
    users: Object.keys(db.users).length,
  };
}
