/**
 * Админ-панель в боте: заказы, поддержка, каталог (CRUD), категории,
 * магазин и контакты, статистика, рассылка.
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
  createProduct, updateProduct, deleteProduct, restoreProduct,
  deletedBaseProducts, restoreBaseCatalog, catalogHealth,
  getCategories, findCategory, createCategory, updateCategory, deleteCategory,
  getShopInfo, updateShopInfo,
  saveProductPhoto, getBrand, getDeliveryInfo, getShopSettings, getSeller, getTexts,
} from '../catalog.js';
import { invoiceSummary } from '../payments/invoice.js';
import { esc, money, dateTime, timeOnly, statusLabel, orderCard, orderLine } from './format.js';

/** Ожидание ввода от админа: adminId -> { type, ... } */
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
    .text('🏪 Магазин и контакты', 'a:shop').text('⚙️ Настройки', 'a:settings')
    .row()
    .text('📣 Рассылка', 'a:broadcast');
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

async function safeAnswer(ctx, text) {
  try {
    await ctx.answerCallbackQuery(text ? { text, show_alert: true } : {});
  } catch {}
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
  kb.text(filter === 'all' ? '• Все' : 'Все', 'a:orders:0:all')
    .text(filter === 'open' ? '• Активные' : 'Активные', 'a:orders:0:open')
    .row()
    .text(filter === 'paid' ? '• Оплаченные' : 'Оплаченные', 'a:orders:0:paid')
    .text(filter === 'invoice' ? '• По счёту' : 'По счёту', 'a:orders:0:invoice')
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
    .text('➕ Добавить товар', 'a:npnew').row()
    .text('🔍 Найти товар', 'a:findproduct').row()
    .text('🚫 Скрытые', 'a:list:hidden').text('📭 Нет в наличии', 'a:list:oos').row()
    .text('✏️ Изменённые цены', 'a:list:edited').text('🗂 Категории', 'a:cats').row();
  if (s.deleted) kb.text(`🗑 Удалённые (${s.deleted})`, 'a:list:deleted').row();
  kb.text('↩️ Вернуть всё из прайса', 'a:restoreall').row();
  kb.text('‹ Меню', 'a:menu');
  const text = [
    '<b>Каталог</b>',
    '',
    `Позиций: <b>${s.total}</b> (своих: ${s.custom}, категорий: ${s.categories})`,
    `Скрыто: ${s.hidden} · нет в наличии: ${s.outOfStock}`,
    `С ручными правками: ${s.edited}`,
    s.deleted ? `⚠️ Удалено из каталога: <b>${s.deleted}</b> (в прайсе ${s.baseTotal} поз.)` : '',
    '',
    'Найдите товар, чтобы изменить любое поле, фото или наличие.',
    'Новый товар добавляется пошагово — с фото и описанием.',
    'Если позиции пропали из витрины — «Вернуть всё из прайса».',
  ].filter(Boolean).join('\n');
  return { text, kb };
}

function productCard(id) {
  const p = findProduct(id);
  if (!p) return { text: 'Товар не найден', kb: new InlineKeyboard().text('‹ Каталог', 'a:catalog') };
  const flags = [
    p.isHit ? '⭐ хит' : '',
    p.isNew ? '🆕 новинка' : '',
    p.custom ? '➕ свой' : '',
  ].filter(Boolean).join(' · ');
  const text = [
    `<b>${esc(p.name)}</b>`,
    `Артикул: <code>${esc(p.article)}</code> · ${esc(categoryTitle(p.category))}`,
    [p.volumeLabel ? `Объём: ${esc(p.volumeLabel)}` : '', p.pieces > 1 ? `Штук: ${p.pieces}` : ''].filter(Boolean).join(' · '),
    p.description ? `\n<i>${esc(p.description.slice(0, 300))}${p.description.length > 300 ? '…' : ''}</i>` : '',
    '',
    `Цена: <b>${money(p.price)}</b>${p.price !== p.basePrice ? ` <s>${money(p.basePrice)}</s>` : ''}`,
    `Статус: ${p.hidden ? '🚫 скрыт' : p.outOfStock ? '📭 нет в наличии' : '✅ в продаже'}`,
    flags ? `Метки: ${flags}` : '',
    `Фото: ${p.image ? '🖼 есть' : '— нет'}`,
  ].filter(Boolean).join('\n');
  const kb = new InlineKeyboard()
    .text('✏️ Название', `a:ed:name:${p.id}`).text('🏷 Артикул', `a:ed:article:${p.id}`).row()
    .text('💰 Цена', `a:price:${p.id}`).text('📦 Объём', `a:ed:volume:${p.id}`).row()
    .text('🗂 Категория', `a:editcat:${p.id}`).text('🔢 Штук', `a:ed:pieces:${p.id}`).row()
    .text('📝 Описание', `a:ed:descr:${p.id}`).text('🖼 Фото', `a:editphoto:${p.id}`).row()
    .text(p.isHit ? '⭐ Убрать хит' : '⭐ Сделать хитом', `a:tog:hit:${p.id}`).row()
    .text(p.isNew ? '🆕 Убрать новинку' : '🆕 Сделать новинкой', `a:tog:new:${p.id}`).row()
    .text(p.outOfStock ? '✅ Вернуть в наличие' : '📭 Нет в наличии', `a:oos:${p.id}`).row()
    .text(p.hidden ? '👁 Показать в каталоге' : '🚫 Скрыть из каталога', `a:hide:${p.id}`).row();
  if (!isBasePrice(p)) kb.text('↩️ Вернуть цену из прайса', `a:resetprice:${p.id}`).row();
  kb.text('🗑 Удалить', `a:del:${p.id}`).row();
  kb.text('🔍 Другой товар', 'a:findproduct').text('‹ Каталог', 'a:catalog');
  return { text, kb };
}

function isBasePrice(p) {
  return p.custom || p.price === p.basePrice;
}

function productList(kind) {
  if (kind === 'deleted') {
    const items = deletedBaseProducts();
    const kb = new InlineKeyboard();
    for (const p of items.slice(0, 20)) {
      kb.text(`↩️ ${p.name} · ${money(p.price)}`.slice(0, 60), `a:dproduct:${p.id}`).row();
    }
    if (items.length) kb.text('↩️ Вернуть все позиции', 'a:restoreall').row();
    kb.text('‹ Каталог', 'a:catalog');
    return {
      text: items.length
        ? '<b>Удалённые из каталога</b>\nЭти позиции есть в прайсе — их можно вернуть:\n\n' +
          items.map((p) => `• ${esc(p.name)}${p.volumeLabel ? ` · ${esc(p.volumeLabel)}` : ''}`).join('\n')
        : '<b>Удалённые из каталога</b>\nСписок пуст — все позиции прайса на месте',
      kb,
    };
  }
  const all = searchProducts('', { includeHidden: true });
  const filtered =
    kind === 'hidden' ? all.filter((p) => p.hidden)
      : kind === 'oos' ? all.filter((p) => p.outOfStock)
        : all.filter((p) => !p.custom && p.price !== p.basePrice);
  const kb = new InlineKeyboard();
  for (const p of filtered.slice(0, 20)) {
    kb.text(`${p.name} · ${money(p.price)}`.slice(0, 60), `a:product:${p.id}`).row();
  }
  kb.text('‹ Каталог', 'a:catalog');
  const titles = { hidden: 'Скрытые товары', oos: 'Нет в наличии', edited: 'Изменённые цены' };
  return {
    text: filtered.length ? `<b>${titles[kind]}</b> · ${filtered.length}` : `<b>${titles[kind]}</b>\nСписок пуст`,
    kb,
  };
}

/** Карточка удалённой позиции из прайса — с кнопкой возврата. */
function deletedProductCard(id) {
  const p = deletedBaseProducts().find((x) => String(x.id) === String(id));
  if (!p) return { text: 'Позиция не найдена', kb: new InlineKeyboard().text('‹ Удалённые', 'a:list:deleted') };
  const text = [
    `<b>${esc(p.name)}</b>`,
    `Артикул: <code>${esc(p.article)}</code> · ${esc(categoryTitle(p.category))}`,
    p.volumeLabel ? `Объём: ${esc(p.volumeLabel)}` : '',
    `Цена: <b>${money(p.price)}</b>`,
    '',
    'Позиция удалена из каталога, но есть в прайсе.',
  ].filter(Boolean).join('\n');
  const kb = new InlineKeyboard()
    .text('↩️ Вернуть в каталог', `a:restore:${p.id}`).row()
    .text('‹ Удалённые', 'a:list:deleted').text('Меню', 'a:menu');
  return { text, kb };
}

// ─── мастер создания товара ────────────────────────────────────
function npConfirmCard(draft) {
  const text = [
    '<b>Новый товар — проверка</b>',
    '',
    `Название: <b>${esc(draft.name)}</b>`,
    draft.article ? `Артикул: <code>${esc(draft.article)}</code>` : 'Артикул: <i>автоматически</i>',
    `Категория: ${esc(findCategory(draft.category)?.title || draft.category)}`,
    `Цена: <b>${money(draft.price)}</b>`,
    draft.volumeMl ? `Объём: ${draft.volumeMl} мл` : draft.volumeLabel ? `Объём: ${esc(draft.volumeLabel)}` : '',
    draft.description ? `<i>${esc(draft.description.slice(0, 200))}</i>` : '',
    `Фото: ${draft._photo ? '🖼 прикреплено' : '— нет'}`,
    `Метки: ${draft.isNew === false ? '' : '🆕 новинка'}${draft.isHit ? ' ⭐ хит' : ''}`.trim(),
  ].filter(Boolean).join('\n');
  const kb = new InlineKeyboard()
    .text(draft.isNew === false ? '🆕 Новинка: нет' : '🆕 Новинка: да', 'a:npf:new').row()
    .text(draft.isHit ? '⭐ Хит: да' : '⭐ Хит: нет', 'a:npf:hit').row()
    .text('✅ Создать товар', 'a:npok').text('❌ Отмена', 'a:npx');
  return { text, kb };
}

function categoryPicker(prefix, selected = null) {
  const kb = new InlineKeyboard();
  for (const c of getCategories()) {
    const mark = c.id === selected ? '• ' : '';
    kb.text(`${mark}${c.emoji ? `${c.emoji} ` : ''}${c.title}`.slice(0, 60), `${prefix}:${c.id}`).row();
  }
  return kb;
}

// ─── категории ──────────────────────────────────────────────────
function categoriesMenu() {
  const cats = getCategories();
  const counts = {};
  for (const p of searchProducts('', { includeHidden: true })) counts[p.category] = (counts[p.category] || 0) + 1;
  const kb = new InlineKeyboard();
  for (const c of cats) {
    kb.text(`${c.emoji ? `${c.emoji} ` : ''}${c.title} (${counts[c.id] || 0})`.slice(0, 60), `a:cat:${c.id}`).row();
  }
  kb.text('➕ Добавить категорию', 'a:catadd').row();
  kb.text('‹ Каталог', 'a:catalog');
  return { text: `<b>Категории</b> · ${cats.length}\nВыберите категорию для редактирования:`, kb };
}

function categoryCard(id) {
  const c = findCategory(id);
  if (!c) return { text: 'Категория не найдена', kb: new InlineKeyboard().text('‹ Категории', 'a:cats') };
  const count = searchProducts('', { includeHidden: true }).filter((p) => p.category === id).length;
  const text = [
    `<b>${c.emoji ? `${c.emoji} ` : ''}${esc(c.title)}</b>`,
    c.subtitle ? esc(c.subtitle) : '',
    `ID: <code>${esc(c.id)}</code>${c.custom ? ' · своя' : ''}`,
    `Товаров: <b>${count}</b>`,
  ].filter(Boolean).join('\n');
  const kb = new InlineKeyboard()
    .text('✏️ Название', `a:cated:${c.id}:title`).row()
    .text('📝 Подзаголовок', `a:cated:${c.id}:subtitle`).row()
    .text('😀 Эмодзи', `a:cated:${c.id}:emoji`).row()
    .text('🗑 Удалить', `a:catdel:${c.id}`).row()
    .text('‹ Категории', 'a:cats');
  return { text, kb };
}

// ─── магазин и контакты ─────────────────────────────────────────
function shopMenu() {
  const brand = getBrand();
  const shop = getShopSettings();
  const seller = getSeller();
  const kb = new InlineKeyboard()
    .text('ℹ️ Название и слоган', 'a:shop:brand').row()
    .text('📣 Telegram / Instagram / почта', 'a:shop:socials').row()
    .text(`👥 Менеджеры (${(brand.managers || []).length})`, 'a:shop:mgrs').row()
    .text('🚚 Доставка', 'a:shop:delivery').row()
    .text('🛒 Пороги и минимум заказа', 'a:shop:sales').row()
    .text(`🧾 Реквизиты ${seller.configured ? '✅' : '⚠️'}`, 'a:shop:seller').row()
    .text('💬 Тексты бота и витрины', 'a:shop:texts').row()
    .text('‹ Меню', 'a:menu');
  const text = [
    '<b>🏪 Магазин и контакты</b>',
    '',
    `Бренд: <b>${esc(brand.title || '')}</b> · ${esc(brand.tagline || '').slice(0, 60)}`,
    `Канал: @${esc(brand.telegram || '—')} · Instagram: @${esc(brand.instagram || '—')}`,
    `Почта: ${esc(brand.email || '—')}`,
    `Доставка бесплатно от: <b>${money(shop.freeShippingFrom)}</b> · стоимость: ${money(shop.shippingCost)}`,
    `Реквизиты: ${seller.configured ? 'заполнены ✅' : 'не заполнены ⚠️'}`,
    '',
    'Всё применяется мгновенно — и в Mini App, и в боте.',
  ].join('\n');
  return { text, kb };
}

const SHOP_FIELD_LABELS = {
  'brand:name': 'Название бренда латиницей',
  'brand:title': 'Название «Посудная лавка»',
  'brand:tagline': 'Слоган',
  'brand:telegram': 'Telegram-канал (без @)',
  'brand:instagram': 'Instagram (без @)',
  'brand:email': 'E-mail',
  'delivery:note': 'Текст про доставку для витрины',
  'delivery:freeCities': 'Города с бесплатной доставкой (через запятую)',
  'shop:freeShippingFrom': 'Бесплатная доставка от (₽)',
  'shop:shippingCost': 'Стоимость доставки (₽)',
  'shop:minOrderTotal': 'Минимальная сумма заказа (₽, 0 — без минимума)',
  'seller:name': 'Название продавца (краткое)',
  'seller:legalName': 'Юридическое название / ИП',
  'seller:inn': 'ИНН',
  'seller:kpp': 'КПП',
  'seller:ogrn': 'ОГРН / ОГРНИП',
  'seller:address': 'Юридический адрес',
  'seller:bankName': 'Банк',
  'seller:bik': 'БИК',
  'seller:account': 'Расчётный счёт',
  'seller:corrAccount': 'Корр. счёт',
  'seller:signer': 'Подписант (ФИО)',
  'seller:phone': 'Телефон для счёта',
  'seller:email': 'E-mail для счёта',
  'seller:invoicePrefix': 'Префикс номера счёта',
  'seller:vat': 'НДС в счёте (none / 10 / 20)',
  'texts:welcome': 'Приветствие бота ({name} — имя)',
  'texts:delivery': 'Текст «Доставка и оплата» (можно HTML)',
  'texts:about': 'Текст «О бренде»',
  'texts:footerNote': 'Подпись в подвале витрины',
};

function fieldButton(section, field, label) {
  return [`${label}`, `a:sf:${section}:${field}`];
}

function shopSection(section) {
  const info = getShopInfo();
  const kb = new InlineKeyboard();
  const back = () => {
    kb.text('‹ Магазин', 'a:shop');
    return kb;
  };
  const rows = (buttons) => {
    for (const [label, data] of buttons) kb.text(label.slice(0, 60), data).row();
    return back();
  };

  if (section === 'brand') {
    const b = info.brand;
    return {
      text: ['<b>Название и слоган</b>', '', `Name: ${esc(b.name || '—')}`, `Заголовок: <b>${esc(b.title || '—')}</b>`, `Слоган: ${esc(b.tagline || '—')}`].join('\n'),
      kb: rows([fieldButton('brand', 'name', '✏️ Name (латиница)'), fieldButton('brand', 'title', '✏️ Заголовок'), fieldButton('brand', 'tagline', '✏️ Слоган')]),
    };
  }
  if (section === 'socials') {
    const b = info.brand;
    return {
      text: ['<b>Контакты</b>', '', `Telegram-канал: @${esc(b.telegram || '—')}`, `Instagram: @${esc(b.instagram || '—')}`, `E-mail: ${esc(b.email || '—')}`].join('\n'),
      kb: rows([fieldButton('brand', 'telegram', '✏️ Telegram-канал'), fieldButton('brand', 'instagram', '✏️ Instagram'), fieldButton('brand', 'email', '✏️ E-mail')]),
    };
  }
  if (section === 'mgrs') {
    const managers = info.brand.managers || [];
    const lines = managers.map((m, i) => `${i + 1}. <b>${esc(m.region)}</b>\n   @${esc(m.telegram || '—')} · ${esc(m.phone || '—')}`);
    const text = ['<b>Менеджеры</b>', '', ...(lines.length ? lines : ['<i>Пока никого нет</i>'])].join('\n');
    for (let i = 0; i < managers.length; i += 1) {
      kb.text(`🗑 ${i + 1}. ${managers[i].region}`.slice(0, 60), `a:mgrdel:${i}`).row();
    }
    kb.text('➕ Добавить менеджера', 'a:mgradd').row();
    return { text, kb: back() };
  }
  if (section === 'delivery') {
    const d = info.delivery;
    return {
      text: ['<b>Доставка</b>', '', `Текст: <i>${esc((d.note || '').slice(0, 400))}</i>`, '', `Бесплатно по городам: ${(d.freeCities || []).join(', ') || '—'}`].join('\n'),
      kb: rows([fieldButton('delivery', 'note', '✏️ Текст про доставку'), fieldButton('delivery', 'freeCities', '✏️ Города с бесплатной доставкой')]),
    };
  }
  if (section === 'sales') {
    const s = info.shop;
    return {
      text: ['<b>Пороги и минимум</b>', '', `Бесплатная доставка от: <b>${money(s.freeShippingFrom)}</b>`, `Стоимость доставки: <b>${money(s.shippingCost)}</b>`, `Минимальный заказ: <b>${s.minOrderTotal ? money(s.minOrderTotal) : 'нет'}</b>`].join('\n'),
      kb: rows([fieldButton('shop', 'freeShippingFrom', '✏️ Бесплатно от'), fieldButton('shop', 'shippingCost', '✏️ Стоимость доставки'), fieldButton('shop', 'minOrderTotal', '✏️ Минимальный заказ')]),
    };
  }
  if (section === 'seller') {
    const s = info.seller;
    const line = (label, v) => `${label}: ${v ? esc(v) : '—'}`;
    return {
      text: ['<b>Реквизиты для счетов</b>', '',
        line('Название', s.name), line('Юр. название', s.legalName),
        line('ИНН', s.inn), line('КПП', s.kpp), line('ОГРН', s.ogrn),
        line('Адрес', s.address), line('Банк', s.bankName), line('БИК', s.bik),
        line('Р/с', s.account), line('К/с', s.corrAccount),
        line('Подписант', s.signer), line('Телефон', s.phone), line('E-mail', s.email),
        line('Префикс счёта', s.invoicePrefix), line('НДС', s.vat),
      ].join('\n'),
      kb: rows([
        fieldButton('seller', 'name', '✏️ Название'), fieldButton('seller', 'legalName', '✏️ Юр. название'),
        fieldButton('seller', 'inn', '✏️ ИНН'), fieldButton('seller', 'kpp', '✏️ КПП'),
        fieldButton('seller', 'ogrn', '✏️ ОГРН'), fieldButton('seller', 'address', '✏️ Адрес'),
        fieldButton('seller', 'bankName', '✏️ Банк'), fieldButton('seller', 'bik', '✏️ БИК'),
        fieldButton('seller', 'account', '✏️ Р/с'), fieldButton('seller', 'corrAccount', '✏️ К/с'),
        fieldButton('seller', 'signer', '✏️ Подписант'), fieldButton('seller', 'phone', '✏️ Телефон'),
        fieldButton('seller', 'email', '✏️ E-mail'), fieldButton('seller', 'invoicePrefix', '✏️ Префикс счёта'),
        fieldButton('seller', 'vat', '✏️ НДС (none/10/20)'),
      ]),
    };
  }
  if (section === 'texts') {
    const t = info.texts;
    return {
      text: ['<b>Тексты</b>', '',
        `<b>Приветствие:</b>\n<i>${esc((t.welcome || '').slice(0, 300))}</i>`, '',
        `<b>Доставка:</b>\n<i>${esc((t.delivery || '').slice(0, 300))}</i>`, '',
        `<b>О бренде:</b>\n<i>${esc((t.about || '').slice(0, 300))}</i>`, '',
        `<b>Подпись:</b> ${esc(t.footerNote || '')}`,
      ].join('\n').slice(0, 3500),
      kb: rows([
        fieldButton('texts', 'welcome', '✏️ Приветствие бота'), fieldButton('texts', 'delivery', '✏️ Доставка и оплата'),
        fieldButton('texts', 'about', '✏️ О бренде'), fieldButton('texts', 'footerNote', '✏️ Подпись витрины'),
      ]),
    };
  }
  return shopMenu();
}

function parseShopValue(section, field, text) {
  const key = `${section}:${field}`;
  if (['shop:freeShippingFrom', 'shop:shippingCost', 'shop:minOrderTotal'].includes(key)) {
    const v = Number.parseInt(String(text).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(v) || v < 0) throw new Error('Нужно число в рублях, например 30000');
    return v;
  }
  if (key === 'delivery:freeCities') {
    return String(text).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  }
  if (key === 'brand:telegram' || key === 'brand:instagram') {
    return String(text).trim().replace(/^@+/, '').replace(/^https?:\/\/t\.me\//, '').slice(0, 80);
  }
  if (key === 'seller:vat') {
    const v = String(text).trim().toLowerCase();
    if (!['none', '10', '20'].includes(v)) throw new Error('Нужно none, 10 или 20');
    return v;
  }
  return String(text).trim().slice(0, 4000);
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
    `Каталог: ${c.total} позиций (${c.custom} своих), категорий ${c.categories}, скрыто ${c.hidden}`,
    bestsellers ? `\n<b>Топ товаров</b>\n${bestsellers}` : '',
  ].filter(Boolean).join('\n');
  return { text, kb: new InlineKeyboard().text('🔄 Обновить', 'a:stats').row().text('‹ Меню', 'a:menu') };
}

function settingsCard() {
  const ok = (v) => (v ? '✅' : '—');
  const shop = getShopSettings();
  const seller = getSeller();
  const text = [
    '<b>Настройки</b>',
    '',
    `Бот: ${ok(config.telegram.hasBot)} · админов: ${config.telegram.adminIds.length}`,
    `PUBLIC_URL: ${config.publicUrl ? esc(config.publicUrl) : '— не задан'}`,
    `ЮKassa: ${ok(config.yookassa.enabled)}`,
    `Реквизиты для счетов: ${ok(seller.configured)}`,
    '',
    `Бесплатная доставка от: ${money(shop.freeShippingFrom)}`,
    `Стоимость доставки: ${money(shop.shippingCost)}`,
    `Минимальный заказ: ${shop.minOrderTotal ? money(shop.minOrderTotal) : 'нет'}`,
    '',
    '<i>Токены и ключи задаются в панели хостинга. Всё остальное правится здесь — в разделе «🏪 Магазин и контакты».</i>',
  ].join('\n');
  return { text, kb: new InlineKeyboard().text('🏪 Магазин и контакты', 'a:shop').row().text('‹ Меню', 'a:menu') };
}

// ─── скачивание фото из Telegram ────────────────────────────────
async function downloadPhoto(ctx) {
  const photos = ctx.msg?.photo;
  if (!photos?.length) return null;
  const best = photos[photos.length - 1];
  const file = await ctx.api.getFile(best.file_id);
  const url = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось скачать фото из Telegram');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new Error('Фото слишком большое (максимум 6 МБ)');
  const ext = String(file.file_path.split('.').pop() || 'jpg').toLowerCase();
  return { buffer, ext: ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg' };
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
    const parts = ctx.callbackQuery.data.split(':');
    const [, action, arg1, arg2, arg3] = parts;
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
      // ── каталог ──
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
      case 'dproduct': {
        const { text, kb } = deletedProductCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'restore': {
        let p = null;
        try {
          p = restoreProduct(arg1);
        } catch (err) {
          return ctx.reply(`❌ ${esc(err.message)}`);
        }
        const { text, kb } = catalogMenu();
        await ctx.reply(`↩️ ${p ? `«${esc(p.name)}» снова на витрине` : 'Позиция возвращена в каталог'}\n\nВсего видно: ${catalogHealth().visible}`);
        return edit(ctx, text, kb);
      }
      case 'restoreall': {
        const s = catalogStats();
        const lines = [
          '<b>Вернуть позиции из прайса</b>',
          '',
          `В прайсе: ${s.baseTotal} поз. · на витрине: ${s.visible}`,
          s.deleted ? `Удалено из каталога: <b>${s.deleted}</b>` : 'Удалённых нет',
          s.hidden ? `Скрыто вручную: <b>${s.hidden}</b>` : '',
          '',
          'Верну все позиции прайса и сниму ручное скрытие.',
          'Свои товары, цены, описания и фото останутся как есть.',
        ].filter(Boolean);
        return edit(ctx, lines.join('\n'),
          new InlineKeyboard().text('↩️ Да, вернуть', 'a:restoreallgo').text('Отмена', 'a:catalog'));
      }
      case 'restoreallgo': {
        const res = restoreBaseCatalog();
        const { text, kb } = catalogMenu();
        await ctx.reply(
          `↩️ Вернул из прайса позиций: ${res.restored}` +
          `${res.unhidden ? `\n👁 Снял скрытие: ${res.unhidden}` : ''}` +
          `\n\nСейчас на витрине: ${res.visible}`,
        );
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
        setOverride(arg1, { outOfStock: p?.outOfStock ? null : true });
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'hide': {
        const p = findProduct(arg1);
        setOverride(arg1, { hidden: p?.hidden ? null : true });
        const { text, kb } = productCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'tog': {
        // a:tog:hit|new:<productId>
        const field = arg1 === 'hit' ? 'isHit' : 'isNew';
        const p = findProduct(arg2);
        if (!p) return;
        updateProduct(arg2, { [field]: !p[field] });
        const { text, kb } = productCard(arg2);
        return edit(ctx, text, kb);
      }
      case 'ed': {
        // a:ed:<field>:<productId>
        pending.set(ctx.from.id, { type: `edit_${arg1}`, productId: arg2 });
        const p = findProduct(arg2);
        const prompts = {
          name: `Новое название (сейчас: «${esc(p?.name || '')}»):`,
          article: `Новый артикул (сейчас: <code>${esc(p?.article || '')}</code>):`,
          volume: `Объём — число в мл или подпись (сейчас: ${esc(p?.volumeLabel || '—')}):`,
          pieces: `Штук в позиции (сейчас: ${p?.pieces || 1}):`,
          descr: `Новое описание:\n\n/cancel — отмена`,
        };
        return ctx.reply(prompts[arg1] || 'Новое значение:', { parse_mode: 'HTML' });
      }
      case 'editcat': {
        pending.set(ctx.from.id, { type: 'editcat', productId: arg1 });
        const kb = categoryPicker('a:pc');
        kb.text('✕ Отмена', 'a:productcancel').row();
        return ctx.reply('Выберите категорию:', { reply_markup: kb });
      }
      case 'pc': {
        // выбор категории для существующего товара
        const state = pending.get(ctx.from.id);
        if (!state || state.type !== 'editcat') return safeAnswer(ctx, 'Начните заново: /admin → Каталог');
        pending.delete(ctx.from.id);
        try {
          updateProduct(state.productId, { category: arg1 });
        } catch (err) {
          return ctx.reply(`❌ ${esc(err.message)}`);
        }
        const { text, kb } = productCard(state.productId);
        return edit(ctx, text, kb);
      }
      case 'productcancel': {
        pending.delete(ctx.from.id);
        return ctx.reply('Отменено');
      }
      case 'editphoto': {
        pending.set(ctx.from.id, { type: 'photo', productId: arg1 });
        return ctx.reply('Пришлите новое фото товара одним сообщением.\n\n/cancel — отмена');
      }
      case 'del': {
        const p = findProduct(arg1);
        return edit(ctx,
          `Удалить товар «<b>${esc(p?.name || '')}</b>»?\nОн исчезнет с витрины. Вернуть можно в «Каталог → 🗑 Удалённые».`,
          new InlineKeyboard().text('🗑 Да, удалить', `a:delgo:${arg1}`).text('Отмена', `a:product:${arg1}`));
      }
      case 'delgo': {
        try {
          deleteProduct(arg1);
        } catch (err) {
          return ctx.reply(`❌ ${esc(err.message)}`);
        }
        const { text, kb } = catalogMenu();
        await ctx.reply('🗑 Товар убран с витрины. Вернуть: Каталог → 🗑 Удалённые');
        return edit(ctx, text, kb);
      }
      // ── новый товар ──
      case 'npnew': {
        pending.set(ctx.from.id, { type: 'np', step: 'name', draft: { isNew: true, isHit: false } });
        return ctx.reply('<b>Новый товар</b>\n\nШаг 1/6 — название товара:', { parse_mode: 'HTML' });
      }
      case 'nc': {
        // выбор категории в мастере
        const state = pending.get(ctx.from.id);
        if (!state || state.type !== 'np' || state.step !== 'category') {
          return safeAnswer(ctx, 'Начните заново: /admin → Каталог → Добавить');
        }
        state.draft.category = arg1;
        state.step = 'price';
        return ctx.reply(`Категория: <b>${esc(findCategory(arg1)?.title || '')}</b>\n\nШаг 3/6 — цена в рублях:`, { parse_mode: 'HTML' });
      }
      case 'npf': {
        const state = pending.get(ctx.from.id);
        if (!state || state.type !== 'np') return;
        if (arg1 === 'new') state.draft.isNew = state.draft.isNew === false;
        if (arg1 === 'hit') state.draft.isHit = !state.draft.isHit;
        const { text, kb } = npConfirmCard(state.draft);
        return edit(ctx, text, kb);
      }
      case 'npok': {
        const state = pending.get(ctx.from.id);
        if (!state || state.type !== 'np') return;
        pending.delete(ctx.from.id);
        try {
          const created = createProduct(state.draft);
          if (state.draft._photo) {
            const image = saveProductPhoto(created.id, state.draft._photo.buffer, state.draft._photo.ext);
            updateProduct(created.id, { image });
          }
          const { text, kb } = productCard(created.id);
          await ctx.reply('✅ Товар создан и уже виден в каталоге');
          return edit(ctx, text, kb);
        } catch (err) {
          return ctx.reply(`❌ Не удалось создать: ${esc(err.message)}\n\nНачните заново: /admin → Каталог → Добавить`);
        }
      }
      case 'npx': {
        pending.delete(ctx.from.id);
        return edit(ctx, 'Создание товара отменено', new InlineKeyboard().text('‹ Каталог', 'a:catalog'));
      }
      // ── категории ──
      case 'cats': {
        const { text, kb } = categoriesMenu();
        return edit(ctx, text, kb);
      }
      case 'cat': {
        const { text, kb } = categoryCard(arg1);
        return edit(ctx, text, kb);
      }
      case 'catadd': {
        pending.set(ctx.from.id, { type: 'cat_add' });
        return ctx.reply('Название новой категории:\n\n/cancel — отмена');
      }
      case 'cated': {
        // a:cated:<catId>:<field>
        pending.set(ctx.from.id, { type: 'cat_edit', catId: arg1, field: arg2 });
        const labels = { title: 'Название', subtitle: 'Подзаголовок', emoji: 'Эмодзи' };
        return ctx.reply(`${labels[arg2] || 'Значение'} категории:\n\n/cancel — отмена`);
      }
      case 'catdel': {
        const c = findCategory(arg1);
        return edit(ctx,
          `Удалить категорию «<b>${esc(c?.title || '')}</b>»?\nУдаление возможно, только если в ней нет товаров.`,
          new InlineKeyboard().text('🗑 Да, удалить', `a:catdelgo:${arg1}`).text('Отмена', `a:cat:${arg1}`));
      }
      case 'catdelgo': {
        try {
          deleteCategory(arg1);
        } catch (err) {
          return edit(ctx, `❌ ${esc(err.message)}`, new InlineKeyboard().text('‹ Категории', 'a:cats'));
        }
        const { text, kb } = categoriesMenu();
        return edit(ctx, text, kb);
      }
      // ── магазин и контакты ──
      case 'shop': {
        if (!arg1) {
          const { text, kb } = shopMenu();
          return edit(ctx, text, kb);
        }
        const { text, kb } = shopSection(arg1);
        return edit(ctx, text, kb);
      }
      case 'sf': {
        // a:sf:<section>:<field>
        pending.set(ctx.from.id, { type: 'shop', section: arg1, field: arg2 });
        const label = SHOP_FIELD_LABELS[`${arg1}:${arg2}`] || 'Новое значение';
        return ctx.reply(`${label}:\n\n/cancel — отмена`);
      }
      case 'mgradd': {
        pending.set(ctx.from.id, { type: 'mgr_add' });
        return ctx.reply('Новый менеджер в формате:\n<code>Регион | @telegram | телефон</code>\n\nНапример:\n<code>Москва и регионы | titov_kirill | +7 961 076-28-68</code>\n\n/cancel — отмена', { parse_mode: 'HTML' });
      }
      case 'mgrdel': {
        const info = getShopInfo();
        const managers = [...(info.brand.managers || [])];
        managers.splice(Number(arg1), 1);
        updateShopInfo({ brand: { managers } });
        const { text, kb } = shopSection('mgrs');
        return edit(ctx, text, kb);
      }
      // ── прочее ──
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

  // ─── мастер создания товара: текстовые шаги ───────────────────
  async function handleNewProductText(ctx, state, text) {
    const draft = state.draft;
    const skip = text === '/skip';

    switch (state.step) {
      case 'name': {
        if (text.length < 2) {
          await ctx.reply('Название слишком короткое. Попробуйте ещё раз:');
          return true;
        }
        draft.name = text.slice(0, 160);
        state.step = 'article';
        await ctx.reply(`Название: <b>${esc(draft.name)}</b>\n\nШаг 2/6 — артикул (или /skip для автоматического):`, { parse_mode: 'HTML' });
        return true;
      }
      case 'article': {
        if (!skip) draft.article = text.replace(/\s+/g, '').slice(0, 40);
        state.step = 'category';
        await ctx.reply('Шаг 3/6 — выберите категорию:', { reply_markup: categoryPicker('a:nc') });
        return true;
      }
      case 'category': {
        await ctx.reply('Выберите категорию кнопкой выше 👆');
        return true;
      }
      case 'price': {
        const value = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
        if (!Number.isFinite(value) || value <= 0) {
          await ctx.reply('Нужно число, например 490. Цена в рублях:');
          return true;
        }
        draft.price = value;
        state.step = 'volume';
        await ctx.reply(`Цена: <b>${money(value)}</b>\n\nШаг 4/6 — объём: число в мл, подпись (например «набор 6 шт») или /skip:`, { parse_mode: 'HTML' });
        return true;
      }
      case 'volume': {
        if (!skip) {
          if (/^\d+$/.test(text.trim())) {
            draft.volumeMl = Number.parseInt(text.trim(), 10);
            draft.volumeLabel = `${draft.volumeMl} мл`;
          } else {
            draft.volumeMl = null;
            draft.volumeLabel = text.slice(0, 60);
          }
        }
        state.step = 'descr';
        await ctx.reply('Шаг 5/6 — описание товара (или /skip):');
        return true;
      }
      case 'descr': {
        if (!skip) draft.description = text.slice(0, 2000);
        state.step = 'photo';
        await ctx.reply('Шаг 6/6 — пришлите фото товара или /skip:');
        return true;
      }
      case 'photo': {
        if (!skip) {
          await ctx.reply('Пришлите фото одним сообщением или /skip, чтобы пропустить.');
          return true;
        }
        const { text: card, kb } = npConfirmCard(draft);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      default: {
        pending.delete(ctx.from.id);
        return false;
      }
    }
  }

  /**
   * Обработка текстового ввода админа (цена, поиск, ответ клиенту, рассылка…).
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
        updateProduct(state.productId, { price: value });
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'edit_name': {
        if (text.length < 2) {
          await ctx.reply('Название слишком короткое');
          return true;
        }
        pending.delete(ctx.from.id);
        try {
          updateProduct(state.productId, { name: text.slice(0, 160) });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'edit_article': {
        pending.delete(ctx.from.id);
        try {
          updateProduct(state.productId, { article: text.replace(/\s+/g, '').slice(0, 40) });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'edit_volume': {
        pending.delete(ctx.from.id);
        const patch = /^\d+$/.test(text.trim())
          ? { volumeMl: Number.parseInt(text.trim(), 10), volumeLabel: `${Number.parseInt(text.trim(), 10)} мл` }
          : { volumeMl: null, volumeLabel: text.slice(0, 60) };
        try {
          updateProduct(state.productId, patch);
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'edit_pieces': {
        const value = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
        if (!Number.isFinite(value) || value <= 0 || value > 999) {
          await ctx.reply('Нужно число от 1 до 999');
          return true;
        }
        pending.delete(ctx.from.id);
        try {
          updateProduct(state.productId, { pieces: value });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'edit_descr': {
        pending.delete(ctx.from.id);
        try {
          updateProduct(state.productId, { description: text.slice(0, 2000) });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = productCard(state.productId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'editcat': {
        await ctx.reply('Выберите категорию кнопкой выше 👆');
        return true;
      }
      case 'photo': {
        await ctx.reply('Пришлите фото одним сообщением — или /cancel для отмены.');
        return true;
      }
      case 'np': {
        return handleNewProductText(ctx, state, text);
      }
      case 'cat_add': {
        if (text.length < 2) {
          await ctx.reply('Название слишком короткое');
          return true;
        }
        pending.delete(ctx.from.id);
        try {
          const created = createCategory({ title: text.slice(0, 80) });
          const { text: card, kb } = categoryCard(created.id);
          await ctx.reply(`✅ Категория создана\n\n${card}`, { parse_mode: 'HTML', reply_markup: kb });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
        }
        return true;
      }
      case 'cat_edit': {
        pending.delete(ctx.from.id);
        try {
          updateCategory(state.catId, { [state.field]: text.slice(0, 80) });
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        const { text: card, kb } = categoryCard(state.catId);
        await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'shop': {
        let value;
        try {
          value = parseShopValue(state.section, state.field, text);
        } catch (err) {
          await ctx.reply(`❌ ${esc(err.message)}`);
          return true;
        }
        pending.delete(ctx.from.id);
        updateShopInfo({ [state.section]: { [state.field]: value } });
        const backSection = state.section === 'brand' && ['telegram', 'instagram', 'email'].includes(state.field)
          ? 'socials'
          : state.section === 'brand' ? 'brand'
            : state.section === 'shop' ? 'sales'
              : state.section;
        const { text: card, kb } = shopSection(backSection);
        await ctx.reply(`✅ Сохранено\n\n${card}`, { parse_mode: 'HTML', reply_markup: kb });
        return true;
      }
      case 'mgr_add': {
        const parts = text.split('|').map((s) => s.trim());
        if (parts.length < 2 || !parts[0]) {
          await ctx.reply('Формат: <code>Регион | @telegram | телефон</code>', { parse_mode: 'HTML' });
          return true;
        }
        pending.delete(ctx.from.id);
        const info = getShopInfo();
        const managers = [...(info.brand.managers || []), {
          region: parts[0].slice(0, 80),
          telegram: (parts[1] || '').replace(/^@/, '').slice(0, 80),
          phone: (parts[2] || '').slice(0, 40),
        }];
        updateShopInfo({ brand: { managers } });
        const { text: card, kb } = shopSection('mgrs');
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
        for (const p of found) kb.text(`${p.name} · ${money(p.price)}`.slice(0, 60), `a:product:${p.id}`).row();
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

  /**
   * Обработка фото от админа: замена фото товара или шаг мастера.
   * @returns {boolean} true — фото обработано
   */
  async function handleAdminPhoto(ctx) {
    const state = pending.get(ctx.from.id);
    if (!state) return false;
    if (state.type !== 'photo' && !(state.type === 'np' && state.step === 'photo')) return false;

    let downloaded;
    try {
      downloaded = await downloadPhoto(ctx);
    } catch (err) {
      await ctx.reply(`❌ ${esc(err.message)}`);
      return true;
    }
    if (!downloaded) return false;

    if (state.type === 'photo') {
      pending.delete(ctx.from.id);
      try {
        const image = saveProductPhoto(state.productId, downloaded.buffer, downloaded.ext);
        updateProduct(state.productId, { image });
      } catch (err) {
        await ctx.reply(`❌ ${esc(err.message)}`);
        return true;
      }
      const { text: card, kb } = productCard(state.productId);
      await ctx.reply(`✅ Фото обновлено\n\n${card}`, { parse_mode: 'HTML', reply_markup: kb });
      return true;
    }

    // мастер создания: держим фото в памяти до подтверждения
    state.draft._photo = downloaded;
    const { text: card, kb } = npConfirmCard(state.draft);
    await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb });
    return true;
  }

  return { handleAdminText, handleAdminPhoto, mainMenu, orderCard, orderKeyboard, threadCard };
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
