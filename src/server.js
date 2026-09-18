/**
 * HTTP-сервер: раздаёт Mini App и обслуживает API.
 */
import path from 'node:path';
import express from 'express';
import { config, paymentMethods, isAdmin, ROOT } from './config.js';
import { db, save, upsertUser, getUser, userTitle } from './store.js';
import { validateInitData } from './lib/telegram-auth.js';
import {
  publicProducts, allProducts, findProduct, getCategories,
  getBrand, getDeliveryInfo, getShopSettings, getTexts,
  createProduct, updateProduct, deleteProduct, restoreProduct,
  createCategory, updateCategory, deleteCategory,
  getShopInfo, updateShopInfo, catalogStats,
  parsePhotoDataUrl, saveProductPhoto,
} from './catalog.js';
import {
  createOrder, getOrder, getOrderByNumber, userOrders, updateOrder, markPaid, setStatus,
  normalizeItems, computeTotals, DELIVERY_METHODS, ORDER_STATUSES, orderStats,
} from './orders.js';
import {
  addUserMessage, addAdminMessage, getThread, markUserRead, markAdminRead,
  listThreads, supportStats,
} from './support.js';
import { renderInvoiceHtml, invoiceSummary } from './payments/invoice.js';
import * as yookassa from './payments/yookassa.js';

const WEBAPP_DIR = path.join(ROOT, 'webapp');

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '8mb' }));

  // ─── авторизация через Telegram initData ──────────────────────
  function authenticate(req, res, next) {
    const initData = req.get('X-Telegram-Init-Data') || '';
    if (initData && config.telegram.token) {
      const result = validateInitData(initData, config.telegram.token);
      if (result.ok) {
        req.user = upsertUser(result.user);
        req.isAdmin = isAdmin(result.user.id);
        return next();
      }
      if (!config.allowDevAuth) {
        return res.status(401).json({ error: 'unauthorized', reason: result.reason });
      }
    }
    if (config.allowDevAuth) {
      // Режим разработки/превью: приложение открывается в обычном браузере.
      const devId = Number(req.get('X-Dev-User') || 1);
      req.user = upsertUser({ id: devId, first_name: 'Гость', username: 'preview' });
      // в превью без настроенных админов гость видит и админ-панель (для проверки)
      req.isAdmin = isAdmin(devId) || config.telegram.adminIds.length === 0;
      req.devMode = true;
      return next();
    }
    return res.status(401).json({ error: 'unauthorized' });
  }

  const api = express.Router();
  api.use(authenticate);

  const wrap = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[api]', err);
      if (!res.headersSent) res.status(400).json({ error: err.message || 'error' });
    });
  };

  // ─── конфигурация витрины ─────────────────────────────────────
  api.get('/config', wrap((req, res) => {
    const shop = getShopSettings();
    res.json({
      brand: getBrand(),
      delivery: {
        ...getDeliveryInfo(),
        methods: Object.entries(DELIVERY_METHODS).map(([id, m]) => ({ id, ...m })),
        freeFrom: shop.freeShippingFrom,
        cost: shop.shippingCost,
      },
      shop,
      texts: getTexts(),
      payments: paymentMethods(),
      statuses: ORDER_STATUSES,
      user: req.user,
      isAdmin: req.isAdmin,
      devMode: Boolean(req.devMode),
      botUsername: config.telegram.username,
      supportEnabled: config.telegram.hasBot || config.allowDevAuth,
    });
  }));

  api.get('/catalog', wrap((req, res) => {
    res.json({ categories: getCategories(), products: publicProducts() });
  }));

  // ─── избранное ────────────────────────────────────────────────
  api.get('/favorites', wrap((req, res) => {
    res.json({ ids: db.favorites[String(req.user.id)] || [] });
  }));

  api.post('/favorites/:id', wrap((req, res) => {
    const key = String(req.user.id);
    const list = new Set(db.favorites[key] || []);
    const id = req.params.id;
    if (!findProduct(id)) throw new Error('Товар не найден');
    if (list.has(id)) list.delete(id);
    else list.add(id);
    db.favorites[key] = [...list];
    save();
    res.json({ ids: db.favorites[key] });
  }));

  // ─── корзина (синхронизация между устройствами) ───────────────
  api.get('/cart', wrap((req, res) => {
    res.json({ items: db.carts[String(req.user.id)] || [] });
  }));

  api.put('/cart', wrap((req, res) => {
    const items = (req.body?.items || [])
      .filter((it) => findProduct(it.id))
      .map((it) => ({ id: String(it.id), qty: Math.max(1, Math.min(999, Number(it.qty) || 1)) }));
    db.carts[String(req.user.id)] = items;
    save();
    res.json({ items });
  }));

  api.post('/cart/quote', wrap((req, res) => {
    const items = normalizeItems(req.body?.items);
    const totals = computeTotals(items, req.body?.deliveryMethod);
    res.json({ items, ...totals });
  }));

  // ─── заказы ───────────────────────────────────────────────────
  api.get('/orders', wrap((req, res) => {
    res.json({ orders: userOrders(req.user.id) });
  }));

  api.get('/orders/:id', wrap((req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    res.json({ order, invoice: order.invoiceNumber ? invoiceSummary(order) : null });
  }));

  api.post('/orders', wrap(async (req, res) => {
    const body = req.body || {};
    const method = body.paymentMethod;
    const available = paymentMethods().filter((m) => m.enabled).map((m) => m.id);
    if (!available.includes(method)) throw new Error('Способ оплаты недоступен');
    if (!body.customer?.name || !body.customer?.phone) throw new Error('Укажите имя и телефон');
    if (method === 'invoice' && (!body.company?.name || !body.company?.inn)) {
      throw new Error('Для счёта нужны название компании и ИНН');
    }
    if (method === 'yookassa' && !body.customer?.email) {
      throw new Error('Для онлайн-оплаты нужен e-mail — на него придёт чек');
    }

    const order = createOrder({
      userId: req.user.id,
      items: body.items,
      customer: body.customer,
      delivery: body.delivery,
      paymentMethod: method,
      company: body.company,
      comment: body.comment,
    });

    db.carts[String(req.user.id)] = [];
    save();

    const payload = { order };

    if (method === 'yookassa') {
      const returnUrl = config.telegram.username
        ? `https://t.me/${config.telegram.username}?startapp=order_${order.id}`
        : `${config.publicUrl || ''}/?order=${order.id}`;
      try {
        const payment = await yookassa.createPayment(order, { returnUrl });
        updateOrder(order.id, { payment: { provider: 'yookassa', id: payment.id }, paymentStatus: 'pending' });
        payload.confirmationUrl = payment.confirmationUrl;
      } catch (err) {
        updateOrder(order.id, { paymentError: err.message });
        throw err;
      }
    }

    if (method === 'invoice') {
      payload.invoice = invoiceSummary(order);
    }

    res.json(payload);
  }));

  // Проверка статуса оплаты (вызывается витриной после возврата с оплаты)
  api.post('/orders/:id/check', wrap(async (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    if (order.paymentStatus === 'paid') return res.json({ order, paid: true });

    if (order.paymentMethod === 'yookassa' && order.payment?.id) {
      const payment = await yookassa.getPayment(order.payment.id);
      if (payment.paid || payment.status === 'succeeded') {
        markPaid(order, { provider: 'yookassa', id: payment.id, method: payment.method }, 'yookassa');
        return res.json({ order, paid: true });
      }
      if (payment.status === 'canceled') {
        updateOrder(order.id, { paymentStatus: 'canceled', status: 'canceled' });
        return res.json({ order, paid: false, canceled: true });
      }
    }
    res.json({ order, paid: false });
  }));

  api.post('/orders/:id/cancel', wrap((req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'not-found' });
    if (order.paymentStatus === 'paid') throw new Error('Оплаченный заказ отменяет менеджер — напишите в поддержку');
    updateOrder(order.id, { status: 'canceled', paymentStatus: 'canceled' }, 'user');
    res.json({ order });
  }));

  // ─── поддержка ────────────────────────────────────────────────
  api.get('/support', wrap((req, res) => {
    const thread = getThread(req.user.id);
    markUserRead(req.user.id);
    res.json({
      messages: thread.messages,
      status: thread.status,
      online: config.telegram.hasBot,
    });
  }));

  api.post('/support', wrap((req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) throw new Error('Пустое сообщение');
    const message = addUserMessage(req.user, text, req.body?.context ? { context: req.body.context } : {});
    res.json({ message });
  }));

  // Лёгкий поллинг новых сообщений
  api.get('/support/updates', wrap((req, res) => {
    const since = Number(req.query.since || 0);
    const thread = getThread(req.user.id, false);
    const messages = (thread?.messages || []).filter((m) => m.at > since);
    if (messages.length) markUserRead(req.user.id);
    res.json({ messages, now: Date.now() });
  }));

  // ─── админ-панель (веб + бот используют одни и те же данные) ──
  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Недостаточно прав' });
    return next();
  });

  admin.get('/stats', wrap((req, res) => {
    const s = orderStats();
    const top = {};
    for (const o of db.orders) {
      if (o.paymentStatus !== 'paid') continue;
      for (const it of o.items) top[it.name] = (top[it.name] || 0) + it.qty;
    }
    res.json({
      orders: s,
      catalog: catalogStats(),
      support: supportStats(),
      bestsellers: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, qty]) => ({ name, qty })),
    });
  }));

  // товары
  admin.get('/products', wrap((req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const filter = String(req.query.filter || 'all');
    let list = allProducts();
    if (filter === 'hidden') list = list.filter((p) => p.hidden);
    else if (filter === 'oos') list = list.filter((p) => p.outOfStock);
    else if (filter === 'custom') list = list.filter((p) => p.custom);
    else if (filter === 'edited') list = list.filter((p) => p.price !== p.basePrice);
    if (q) {
      list = list.filter((p) =>
        `${p.name} ${p.article} ${p.id} ${p.volumeLabel || ''}`.toLowerCase().includes(q));
    }
    res.json({ products: list, categories: getCategories() });
  }));

  admin.post('/products', wrap((req, res) => {
    const body = req.body || {};
    const product = createProduct(body);
    if (body.photoData) {
      const { buffer, ext } = parsePhotoDataUrl(body.photoData);
      const image = saveProductPhoto(product.id, buffer, ext);
      updateProduct(product.id, { image });
    }
    res.json({ product: findProduct(product.id) });
  }));

  admin.put('/products/:id', wrap((req, res) => {
    const body = req.body || {};
    let product = updateProduct(req.params.id, body);
    if (body.photoData) {
      const { buffer, ext } = parsePhotoDataUrl(body.photoData);
      const image = saveProductPhoto(product.id, buffer, ext);
      product = updateProduct(product.id, { image });
    }
    res.json({ product });
  }));

  admin.delete('/products/:id', wrap((req, res) => {
    res.json(deleteProduct(req.params.id));
  }));

  admin.post('/products/:id/restore', wrap((req, res) => {
    res.json({ product: restoreProduct(req.params.id) });
  }));

  // категории
  admin.get('/categories', wrap((req, res) => {
    const counts = {};
    for (const p of allProducts()) counts[p.category] = (counts[p.category] || 0) + 1;
    res.json({
      categories: getCategories().map((c) => ({ ...c, products: counts[c.id] || 0 })),
    });
  }));

  admin.post('/categories', wrap((req, res) => {
    res.json({ category: createCategory(req.body || {}) });
  }));

  admin.put('/categories/:id', wrap((req, res) => {
    res.json({ category: updateCategory(req.params.id, req.body || {}) });
  }));

  admin.delete('/categories/:id', wrap((req, res) => {
    deleteCategory(req.params.id);
    res.json({ ok: true });
  }));

  // информация о магазине: бренд, контакты, доставка, реквизиты, тексты
  admin.get('/shop-info', wrap((req, res) => {
    res.json(getShopInfo());
  }));

  admin.put('/shop-info', wrap((req, res) => {
    res.json(updateShopInfo(req.body || {}));
  }));

  // заказы
  admin.get('/orders', wrap((req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const filter = String(req.query.filter || 'all');
    let orders = db.orders;
    if (filter === 'open') orders = orders.filter((o) => !['done', 'canceled'].includes(o.status));
    else if (filter === 'paid') orders = orders.filter((o) => o.paymentStatus === 'paid');
    else if (filter === 'invoice') orders = orders.filter((o) => o.paymentMethod === 'invoice');
    if (q) {
      orders = orders.filter((o) =>
        `${o.number} ${o.id} ${o.customer?.name || ''} ${o.customer?.phone || ''} ${o.company?.name || ''} ${o.company?.inn || ''}`
          .toLowerCase().includes(q));
    }
    res.json({
      orders: orders.slice(0, 200).map((o) => ({
        ...o,
        userTitle: userTitle(o.userId),
        username: getUser(o.userId)?.username || '',
      })),
      total: orders.length,
    });
  }));

  admin.put('/orders/:id', wrap((req, res) => {
    const order = getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const status = String(req.body?.status || '');
    if (!ORDER_STATUSES[status]) throw new Error('Неизвестный статус');
    setStatus(order, status, `admin:${req.user.id}`);
    res.json({ order });
  }));

  // поддержка
  admin.get('/threads', wrap((req, res) => {
    res.json({
      threads: listThreads().map((t) => ({
        userId: t.userId,
        title: t.title,
        username: getUser(t.userId)?.username || '',
        unreadAdmin: t.unreadAdmin,
        status: t.status,
        updatedAt: t.updatedAt,
        lastMessage: t.lastMessage,
        messagesCount: t.messages.length,
      })),
    });
  }));

  admin.get('/threads/:userId', wrap((req, res) => {
    const thread = getThread(req.params.userId, false);
    if (!thread) return res.status(404).json({ error: 'Диалог не найден' });
    markAdminRead(req.params.userId);
    res.json({
      thread: {
        ...thread,
        title: userTitle(req.params.userId),
        username: getUser(req.params.userId)?.username || '',
      },
    });
  }));

  admin.post('/threads/:userId/reply', wrap((req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) throw new Error('Пустое сообщение');
    const name = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'Поддержка';
    const message = addAdminMessage(req.params.userId, text, { name });
    res.json({ message });
  }));

  api.use('/admin', admin);

  app.use('/api', api);

  // ─── вебхук ЮKassa ────────────────────────────────────────────
  app.post('/webhook/yookassa', express.json(), async (req, res) => {
    res.status(200).end();
    try {
      const event = req.body;
      const paymentId = event?.object?.id;
      const orderId = event?.object?.metadata?.orderId;
      if (!paymentId || !orderId) return;
      const order = getOrder(orderId);
      if (!order) return;
      const payment = await yookassa.getPayment(paymentId);
      if (payment.paid || payment.status === 'succeeded') {
        markPaid(order, { provider: 'yookassa', id: paymentId, method: payment.method }, 'yookassa');
      } else if (payment.status === 'canceled') {
        updateOrder(order.id, { paymentStatus: 'canceled' }, 'yookassa');
      }
    } catch (err) {
      console.error('[yookassa webhook]', err.message);
    }
  });

  // ─── печатная форма счёта ─────────────────────────────────────
  app.get('/invoice/:id', (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || !order.invoiceNumber) return res.status(404).send('Счёт не найден');
    if (order.invoiceKey && req.query.k !== order.invoiceKey) return res.status(403).send('Нет доступа');
    res.type('html').send(renderInvoiceHtml(order));
  });

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      bot: config.telegram.hasBot,
      orders: db.orders.length,
      catalog: { total: allProducts().length, public: publicProducts().length, categories: getCategories().length },
      uptime: process.uptime(),
    });
  });

  // ─── статика Mini App ─────────────────────────────────────────
  app.use(express.static(WEBAPP_DIR, {
    etag: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not-found' });
    res.sendFile(path.join(WEBAPP_DIR, 'index.html'));
  });

  return app;
}

export function startServer() {
  const app = createServer();
  return new Promise((resolve) => {
    const server = app.listen(config.port, config.host, () => {
      console.log(`[web] Mini App на http://${config.host}:${config.port}`);
      if (!config.publicUrl) console.log('[web] PUBLIC_URL не задан — ссылки на счета будут относительными');
      resolve(server);
    });
  });
}
