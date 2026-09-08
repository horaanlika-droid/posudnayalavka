/**
 * Админ-панель в боте: заказы, поддержка, каталог, статистика, рассылка.
 * Список администраторов берётся из переменной окружения ADMIN_IDS.
 */
import { InlineKeyboard } from 'grammy';
import { config, isAdmin } from '../config.js';
import { db, save, userTitle, getUser } from '../store.js';
import {
  ORDER_STATUSES, getOrder, getOrderByNumber, setStatus, updateOrder, orderStats,
} from '../orders.js';
import {
  listThreads, addAdminMessage, markAdminRead, getThread, supportStats,
} from '../support.js';
import {
  searchProducts, findProduct, setOverride, catalogStats, categoryTitle,
} from '../catalog.js';
import { invoiceSummary } from '../payments/invoice.js';
import { esc, money, dateTime, timeOnly, statusLabel, orderCard, orderLine } from './format.js';

/** Ожидание текстового ввода от админа: adminId -> { type, payload } */
const pending = new Map();

const PAGE = 6;

export function adminPending(userId) {
  return pending.get(Number(userId));
}

export function clearPending(userId) {
  pending.delete(Number(userId));
}

function mainMenu() {
  const s = orderStats();
  const sup = supportStats();
  const kb = new InlineKeyboard()
    .text(`📦 Заказы (${s.open})`, 'a:orders:0').text(`💬 Поддержка${sup.unread ? ` (${sup.unread})` : ''}`, 'a:threads:0')
    .row()
    .text('🍸 Каталог', 'a:catalog').text('📊 Статистика', 'a:stats')
    .row()
    .text('📣 Рассылка', 'a:broadcast').text('⚙️ Настройки', 'a:settings');
  const text = [
    '<b>Панель управления</b> · Посудная лавка',
    '',
    `Открытых заказов: <b>${s.open}</b> · за сутки: ${s.today}`,
    `Выручка (оплачено): <b>${money(s.revenue)}</b>`,
    `Диалогов в поддержке: ${sup.threads}${sup.unread ? ` · <b>без ответа: ${sup.unread}</b>` : ''}`,
  ].join('\n');
  return { text, kb };
}

async function edit(ctx, text, kb) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } });
  }
}

// ─── заказы ─────────────────────────────────────────────────────
function ordersPage(page, filter = 'all') {
  let orders = db.orders;
  if (filter === 'open') orders = orders.filter((o) => !['done', 'canceled'].includes(o.status));
  if (filter === 'paid') orders = orders.filter((o) => o.paymentStatus === 'paid');
  if (filter === 'invoice') orders = orders.filter((o) => o.paymentMethod === 'invoice');
  const pages = Math.max(1, Math.ceil(orders.length / PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = orders.slice(p * PAGE, p * PAGE + PAGE);

  const kb = new InlineKeyboard();
  for (const o of slice) kb.text(orderLine(o), `a:order:${o.id}`).row();
  if (pages > 1) {
    kb.text('‹', `a:orders:${Math.max(0, p - 1)}:${filter}`)
      .text(`${p + 1}/${pages}`, 'a:noop')
      .text('›', `a:orders:${Math.min(pages - 1, p + 1)}:${filter}`)
      .row();
  }
  kb.text(filter === 'all' ? '• Все' : 'Все', `a:orders:0:all`)
    .text(filter === 'open' ? '• Активные' : 'Активные', `a:orders:0:open`)
    .row()
    .text(filter === 'paid' ? '• Оплаченные' : 'Оплаченные', `a:orders:0:paid`)
    .text(filter === 'invoice' ? '• По счёту' : 'По счёту', `a:orders:0:invoice`)
    .row()
    .text('🔍 Найти по номеру', 'a:findorder')
    .row()
    .text('‹ Меню', 'a:menu');

  const text = orders.length
    ? `<b>Заказы</b> · всего ${orders.length}\nВыберите заказ:`
    : '<b>Заказов пока нет</b>';
  return { text, kb };
}

function orderKeyboard(order) {
  const kb = new InlineKeyboard();
  const flow = ['paid', 'packing', 'shipped', 'done'];
  const row = [];
  for (const st of flow) {
    if (st === order.status) continue;
    row.push([`${ORDER_STATUSES[st].emoji} ${ORDER_STATUSES[st].title}`, `a:setst:${order.id}:${st}`]);
  }
  for (let i = 0; i < row.length; i += 2) {
    kb.text(row[i][0], row[i][1]);
    if (row[i + 1]) kb.text(row[i + 1][0], row[i + 1][1]);
    kb.row();
  }
  kb.text('✍️ Написать клиенту', `a:reply:${order.userId}`);
  if (order.invoiceNumber && config.publicUrl) {
    kb.url('🧾 Счёт', invoiceSummary(order).url);
  }
  kb.row();
  if (order.status !== 'canceled') kb.text('❌ Отменить заказ', `a:setst:${order.id}:canceled`).row();
  kb.text('‹ К заказам', 'a:orders:0').text('Меню', 'a:menu');
  return kb;
}

// ─── поддержка ──────────────────────────────────────────────────
function threadsPage(page) {
  const threads = listThreads();
  const pages = Math.max(1, Math.ceil(threads.length / PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const kb = new InlineKeyboard();
  for (const t of threads.slice(p * PAGE, p * PAGE + PAGE)) {
    const mark = t.unreadAdmin ? `🔴 ${t.unreadAdmin} ` : '💬 ';
    kb.text(`${mark}${t.title} · ${timeOnly(t.updatedAt)}`, `a:thread:${t.userId}`).row();
  }
  if (pages > 1) {
    kb.text('‹', `a:threads:${Math.max(0, p - 1)}`).text(`${p + 1}/${pages}`, 'a:noop')
      .text('›', `a:threads:${Math.min(pages - 1, p + 1)}`).row();
  }
  kb.text('‹ Меню', 'a:menu');
  return {
    text: threads.length ? '<b>Поддержка</b>\nДиалоги с клиентами:' : '<b>Обращений пока нет</b>',
    kb,
  };
}

function threadCard(userId) {
  const thread = getThread(userId, false);
  const user = getUser(userId);
  if (!thread) return { text: 'Диалог не найден', kb: new InlineKeyboard().text('‹ Назад', 'a:threads:0') };
  const last = thread.messages.slice(-12);
  const lines = last.map((m) => {
    const who = m.from === 'user' ? '👤' : m.from === 'admin' ? '🛎' : 'ℹ️';
    return `${who} <i>${timeOnly(m.at)}</i>\n${esc(m.text)}`;
  });
  const orders = db.orders.filter((o) => o.userId === Number(userId));
  const text = [
    `<b>${esc(userTitle(userId))}</b> · <code>${userId}</code>`,
    user?.username ? `@${esc(user.username)}` : '',
    `Заказов: ${orders.length}${orders.length ? ` · на ${money(orders.reduce((s, o) => s + o.total, 0))}` : ''}`,
    '',
    lines.join('\n\n') || 'Сообщений нет',
  ].filter(Boolean).join('\n');

  const kb = new InlineKeyboard()
    .text('✍️ Ответить', `a:reply:${userId}`).row()
    .text('✅ Прочитано', `a:read:${userId}`).text('🔄 Обновить', `a:thread:${userId}`).row()
    .text('‹ К диалогам', 'a:threads:0').text('Меню', 'a:menu');
  return { text: text.slice(0, 3800), kb };
}

// ─── каталог ────────────────────────────────────────────────────
function catalogMenu() {
  const s = catalogStats();
  const kb = new InlineKeyboard()
    .text('🔍 Найти товар', 'a:findproduct').row()
    .text('🚫 Скрытые', 'a:list:hidden').text('📭 Нет в наличии', 'a:list:oos').row()
    .text('✏️ Изменённые цены', 'a:list:edited').row()
    .text('‹ Меню', 'a:menu');
  const text = [
    '<b>Каталог</b>',
    '',
    `Позиций: <b>${s.total}</b>`,
    `Скрыто: ${s.hidden} · нет в наличии: ${s.outOfStock}`,
    `С ручными правками: ${s.edited}`,
    '',
    'Найдите товар по названию или артикулу, чтобы изменить цену и наличие.',
  ].join('\n');
  return { text, kb };
}

function productCard(id) {
  const p = findProduct(id);
  if (!p) return { text: 'Товар не найден', kb: new InlineKeyboard().text('‹ Каталог', 'a:catalog') };
  const text = [
    `<b>${esc(p.name)}</b>`,
    `Артикул: <code>${esc(p.article)}</code> · ${esc(categoryTitle(p.category))}`,
    p.volumeLabel ? `Объём: ${esc(p.volumeLabel)}` : '',
    '',
    `Цена: <b>${money(p.price)}</b>${p.price !== p.basePrice ? ` <s>${money(p.basePrice)}</s>` : ''}`,
    `Статус: ${p.hidden ? '🚫 скрыт' : p.outOfStock ? '📭 нет в наличии' : '✅ в продаже'}`,
  ].filter(Boolean).join('\n');
  const kb = new InlineKeyboard()
    .text('💰 Изменить цену', `a:price:${p.id}`).row()
    .text(p.outOfStock ? '✅ Вернуть в наличие' : '📭 Нет в наличии', `a:oos:${p.id}`).row()
    .text(p.hidden ? '👁 Показать в каталоге' : '🚫 Скрыть из каталога', `a:hide:${p.id}`).row();
  if (p.price !== p.basePrice) kb.text('↩️ Вернуть цену из прайса', `a:resetprice:${p.id}`).row();
  kb.text('🔍 Другой товар', 'a:findproduct').text('‹ Каталог', 'a:catalog');
  return { text, kb };
}

function productList(kind) {
  const all = searchProducts('', { includeHidden: true });
  const filtered =
    kind === 'hidden' ? all.filter((p) => p.hidden)
      : kind === 'oos' ? all.filter((p) => p.outOfStock)
        : all.filter((p) => p.price !== p.basePrice);
  const kb = new InlineKeyboard();
  for (const p of filtered.slice(0, 20)) {
    kb.text(`${p.name} · ${money(p.price)}`, `a:product:${p.id}`).row();
  }
  kb.text('‹ Каталог', 'a:catalog');
  const titles = { hidden: 'Скрытые товары', oos: 'Нет в наличии', edited: 'Изменённые цены' };
  return {
    text: filtered.length ? `<b>${titles[kind]}</b> · ${filtered.length}` : `<b>${titles[kind]}</b>\nСписок пуст`,
    kb,
  };
}

// ─── статистика ─────────────────────────────────────────────────
function statsCard() {
  const s = orderStats();
  const c = catalogStats();
  const sup = supportStats();
  const top = {};
  for (const o of db.orders) {
    if (o.paymentStatus !== 'paid') continue;
    for (const it of o.items) top[it.name] = (top[it.name] || 0) + it.qty;
  }
  const bestsellers = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty], i) => `${i + 1}. ${esc(name)} — ${qty} шт.`).join('\n');

  const text = [
    '<b>Статистика</b>',
    '',
    `Заказы: всего ${s.total} · сегодня ${s.today} · за неделю ${s.week}`,
    `Оплачено: ${s.paidCount} на <b>${money(s.revenue)}</b>`,
    `Средний чек: ${money(s.avgCheck)}`,
    `Активных заказов: ${s.open}`,
    '',
    `Пользователей: ${s.users}`,
    `Диалогов: ${sup.threads} (без ответа ${sup.unread})`,
    `Каталог: ${c.total} позиций, скрыто ${c.hidden}`,
    bestsellers ? `\n<b>Топ товаров</b>\n${bestsellers}` : '',
  ].filter(Boolean).join('\n');
  return { text, kb: new InlineKeyboard().text('🔄 Обновить', 'a:stats').row().text('‹ Меню', 'a:menu') };
}

function settingsCard() {
  const ok = (v) => (v ? '✅' : '—');
  const text = [
    '<b>Настройки</b> (переменные окружения)',
    '',
    `Бот: ${ok(config.telegram.hasBot)} · админов: ${config.telegram.adminIds.length}`,
    `PUBLIC_URL: ${config.publicUrl ? esc(config.publicUrl) : '— не задан'}`,
    `ЮKassa: ${ok(config.yookassa.enabled)}`,
    `Реквизиты для счетов: ${ok(config.seller.configured)}`,
    '',
    `Бесплатная доставка от: ${money(config.shop.freeShippingFrom)}`,
    `Стоимость доставки: ${money(config.shop.shippingCost)}`,
    '',
    '<i>Значения меняются в панели хостинга и применяются после перезапуска.</i>',
  ].join('\n');
  return { text, kb: new InlineKeyboard().text('‹ Меню', 'a:menu') };
}

// ─── регистрация обработчиков ───────────────────────────────────
export function registerAdmin(bot, { notifyUser }) {
  bot.command('admin', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const { text, kb } = mainMenu();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('orders', async (ctx, next) => {
    // у клиента своя версия команды — пропускаем дальше
    if (!isAdmin(ctx.from.id)) return next();
    const { text, kb } = ordersPage(0);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('stats', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const { text, kb } = statsCard();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/^a:/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Недостаточно прав' });
    const [, action, arg1, arg2] = ctx.callbackQuery.data.split(':');
    await ctx.answerCallbackQuery().catch(() => {});

    switch (action) {
      case 'menu': {
        const { text, kb } = mainMenu();
        return edit(ctx, text, kb);
      }
      case 'orders': {
        const { text, kb } = ordersPage(Number(arg1) || 0, arg2 || 'all');
        return edit(ctx, text, kb);
      }
      case 'order': {
        const order = getOrder(arg1);
        if (!order) return edit(ctx, 'Заказ не найден', new InlineKeyboard().text('‹ Заказы', 'a:orders:0'));
        return edit(ctx, orderCard(order), orderKeyboard(order));
      }
      case 'setst': {
        const order = getOrder(arg1);
        if (!order) return;
        setStatus(order, arg2, `admin:${ctx.from.id}`);
        await notifyUser(order.userId, statusMessage(order));
        return edit(ctx, orderCard(order), orderKeyboard(order));
      }
      case 'findorder': {
        pending.set(ctx.from.id, { type: 'findorder' });
        return ctx.reply('Отправьте номер заказа (например, <code>ПЛ-1001</code>)', { parse_mode: 'HTML' });
      }
      case 'threads': {
        const { text, kb } = threadsPage(Number(arg1) || 0);
        return edit(ctx, text, kb);
      }
      case 'thread': {
        markAdminRead(arg1);
        const { text, kb } = threadCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'read': {
        markAdminRead(arg1);
        const { text, kb } = threadCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'reply': {
        pending.set(ctx.from.id, { type: 'reply', userId: Number(arg1) });
        return ctx.reply(
          `Напишите ответ для <b>${esc(userTitle(arg1))}</b> — сообщение придёт в чат поддержки внутри приложения.\n\n/cancel — отмена`,
          { parse_mode: 'HTML' },
        );
      }
      case 'catalog': {
        const { text, kb } = catalogMenu();
        return edit(ctx, text, kb);
      }
      case 'findproduct': {
        pending.set(ctx.from.id, { type: 'findproduct' });
        return ctx.reply('Введите название или артикул товара (например, <code>021</code> или <code>nick</code>)', { parse_mode: 'HTML' });
      }
      case 'list': {
        const { text, kb } = productList(arg1);
        return edit(ctx, text, kb);
      }
      case 'product': {
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'price': {
        pending.set(ctx.from.id, { type: 'price', productId: arg1 });
        const p = findProduct(arg1);
        return ctx.reply(`Новая цена для «${esc(p?.name || '')}» в рублях (сейчас ${money(p?.price || 0)}):`, { parse_mode: 'HTML' });
      }
      case 'resetprice': {
        setOverride(arg1, { price: null });
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'oos': {
        const p = findProduct(arg1);
        setOverride(arg1, { outOfStock: p.outOfStock ? null : true });
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'hide': {
        const p = findProduct(arg1);
        setOverride(arg1, { hidden: p.hidden ? null : true });
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'stats': {
        const { text, kb } = statsCard();
        return edit(ctx, text, kb);
      }
      case 'settings': {
        const { text, kb } = settingsCard();
        return edit(ctx, text, kb);
      }
      case 'broadcast': {
        pending.set(ctx.from.id, { type: 'broadcast' });
        return ctx.reply(
          `Отправьте текст рассылки. Получателей: <b>${Object.keys(db.users).length}</b>.\nПоддерживается HTML-разметка.\n\n/cancel — отмена`,
          { parse_mode: 'HTML' },
        );
      }
      case 'bcast_go': {
        const text = db.settings.pendingBroadcast;
        if (!text) return;
        const ids = Object.keys(db.users);
        await edit(ctx, `📣 Рассылка запущена: ${ids.length} получателей…`, new InlineKeyboard().text('‹ Меню', 'a:menu'));
        let sent = 0;
        let failed = 0;
        for (const id of ids) {
          try {
            await bot.api.sendMessage(id, text, { parse_mode: 'HTML' });
            sent += 1;
          } catch {
            failed += 1;
          }
          await new Promise((r) => setTimeout(r, 40)); // ~25 сообщений в секунду
        }
        delete db.settings.pendingBroadcast;
        save();
        return ctx.reply(`📣 Готово. Доставлено: ${sent}, ошибок: ${failed}`);
      }
      case 'noop':
      default:
        return undefined;
    }
  });

  /**
   * Обработка текстового ввода админа (цена, поиск, ответ клиенту, рассылка).
   * @returns {boolean} true — сообщение обработано админ-панелью
   */
  async function handleAdminText(ctx) {
    const state = pending.get(ctx.from.id);
    if (!state) return false;
    const text = (ctx.message?.text || '').trim();
    if (!text) return false;
    if (text === '/cancel') {
      pending.delete(ctx.from.id);
      await ctx.reply('Отменено');
      return true;
    }

    switch (state.type) {
      case 'reply': {
        pending.delete(ctx.from.id);
        addAdminMessage(state.userId, text, { name: ctx.from.first_name });
        await notifyUser(state.userId, `🛎 <b>Поддержка</b>\n\n${esc(text)}`);
        await ctx.reply('✅ Отправлено клиенту', {
          reply_markup: new InlineKeyboard().text('💬 Открыть диалог', `a:thread:${state.userId}`),
        });
        return true;
      }
      case 'price': {
        const value = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
        if (!Number.isFinite(value) || value <= 0) {
          await ctx.reply('Нужно число, например 490');
          return true;
        }
        pending.delete(ctx.from.id);
        setOverride(state.productId, { price: value });
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'findproduct': {
        pending.delete(ctx.from.id);
        const found = searchProducts(text, { includeHidden: true }).slice(0, 12);
        if (!found.length) {
          await ctx.reply('Ничего не найдено. Попробуйте другой запрос: /admin → Каталог');
          return true;
        }
        if (found.length === 1) {
          const { text: card, kb } = productCard(found[0].id);
          await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
          return true;
        }
        const kb = new InlineKeyboard();
        for (const p of found) kb.text(`${p.name} · ${money(p.price)}`, `a:product:${p.id}`).row();
        kb.text('‹ Каталог', 'a:catalog');
        await ctx.reply(`Найдено: ${found.length}`, { reply_markup: kb });
        return true;
      }
      case 'findorder': {
        pending.delete(ctx.from.id);
        const order = getOrderByNumber(text) || getOrder(text);
        if (!order) {
          await ctx.reply('Заказ не найден');
          return true;
        }
        await ctx.reply(orderCard(order), { parse_mode: 'HTML', reply_markup: orderKeyboard(order) });
        return true;
      }
      case 'broadcast': {
        pending.delete(ctx.from.id);
        db.settings.pendingBroadcast = text;
        save();
        await ctx.reply(
          `<b>Предпросмотр рассылки</b>\n\n${text}\n\n———\nПолучателей: ${Object.keys(db.users).length}`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('📣 Отправить', 'a:bcast_go')
              .text('Отмена', 'a:menu'),
          },
        );
        return true;
      }
      default:
        pending.delete(ctx.from.id);
        return false;
    }
  }

  return { handleAdminText, mainMenu, orderCard, orderKeyboard, threadCard };
}

/** Текст уведомления клиенту о смене статуса. */
export function statusMessage(order) {
  const map = {
    paid: `✅ Оплата по заказу <b>${order.number}</b> подтверждена. Начинаем сборку.`,
    packing: `📦 Заказ <b>${order.number}</b> собирается.`,
    shipped: `🚚 Заказ <b>${order.number}</b> передан в доставку.`,
    done: `🎉 Заказ <b>${order.number}</b> доставлен. Спасибо, что выбрали «Посудную лавку»!`,
    canceled: `❌ Заказ <b>${order.number}</b> отменён. Если это ошибка — напишите в поддержку.`,
    new: `🆕 Заказ <b>${order.number}</b> принят в работу.`,
    awaiting_payment: `⏳ Заказ <b>${order.number}</b> ожидает оплаты.`,
  };
  return map[order.status] || `Статус заказа ${order.number}: ${statusLabel(order.status)}`;
}
