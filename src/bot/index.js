/**
 * Telegram-бот: витрина Mini App для клиента, чат поддержки и админ-панель.
 * Токен, ID администраторов и адрес приложения приходят из переменных окружения.
 */
import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import { config, isAdmin } from '../config.js';
import { db, save, upsertUser, userTitle } from '../store.js';
import { events } from '../events.js';
import { addUserMessage, addAdminMessage, getThread } from '../support.js';
import { userOrders } from '../orders.js';
import { brand } from '../catalog.js';
import { invoiceSummary } from '../payments/invoice.js';
import { registerAdmin, statusMessage, adminPending } from './admin.js';
import { esc, money, orderCard, statusLabel, dateTime } from './format.js';

let bot = null;
export const getBot = () => bot;

const appUrl = () => (config.publicUrl?.startsWith('https://') ? config.publicUrl : '');

function shopKeyboard() {
  const kb = new InlineKeyboard();
  const url = appUrl();
  if (url) kb.webApp('🍸 Открыть магазин', url).row();
  else if (config.telegram.username) kb.url('🍸 Открыть магазин', `https://t.me/${config.telegram.username}?startapp=shop`).row();
  kb.text('🚚 Доставка и оплата', 'u:delivery').text('💬 Поддержка', 'u:support');
  return kb;
}

async function notifyAdmins(text, keyboard) {
  if (!bot) return;
  for (const id of config.telegram.adminIds) {
    try {
      await bot.api.sendMessage(id, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      console.warn(`[bot] не удалось уведомить админа ${id}:`, err.message);
    }
  }
}

async function notifyUser(userId, text, keyboard) {
  if (!bot) return false;
  try {
    await bot.api.sendMessage(userId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    console.warn(`[bot] сообщение пользователю ${userId} не доставлено:`, err.message);
    return false;
  }
}

const WELCOME = (name) => [
  `${name ? `${esc(name)}, п` : 'П'}риветствуем в «Посудной лавке» 🥃`,
  '',
  'Барное стекло по прямым контрактам с производствами: хайболы, олд фешн,',
  'коктейльные и винные бокалы, графины и чайная коллекция.',
  '',
  '• Каталог с актуальными ценами и наличием',
  '• Оплата картой или счёт для юрлица',
  '• Доставка по России и миру, по Москве и Санкт-Петербургу — бесплатно',
  '',
  'Нажмите «Открыть магазин», чтобы собрать заказ.',
].join('\n');

const DELIVERY_TEXT = [
  '<b>Доставка и оплата</b>',
  '',
  'Собираем и отгружаем заказ за 1–2 рабочих дня после оплаты.',
  '',
  '• Москва и Санкт-Петербург — бесплатно',
  '• По России — бесплатно от 30 000 ₽ (СДЭК или ПЭК)',
  '• Казахстан, Беларусь, Армения, Узбекистан и другие страны — рассчитываем индивидуально',
  '',
  '<b>Оплата:</b> картой онлайн через ЮKassa или по счёту для юридических лиц с закрывающими документами.',
].join('\n');

export function createBot() {
  if (!config.telegram.token) {
    console.log('[bot] BOT_TOKEN не задан — бот не запускается (веб-часть работает)');
    return null;
  }

  bot = new Bot(config.telegram.token);
  const admin = registerAdmin(bot, { notifyUser });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error('[bot] ошибка Telegram:', e.description);
    else if (e instanceof HttpError) console.error('[bot] сеть недоступна:', e.message);
    else console.error('[bot]', e);
  });

  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) upsertUser(ctx.from);
    await next();
  });

  // ─── клиентские команды ───────────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(WELCOME(ctx.from.first_name), { parse_mode: 'HTML', reply_markup: shopKeyboard() });
    if (isAdmin(ctx.from.id)) {
      await ctx.reply('Вы вошли как администратор. Панель управления — /admin', {
        reply_markup: new InlineKeyboard().text('⚙️ Открыть панель', 'a:menu'),
      });
    }
  });

  bot.command('shop', async (ctx) => {
    await ctx.reply('Каталог «Посудной лавки»:', { reply_markup: shopKeyboard() });
  });

  bot.command('help', async (ctx) => {
    const lines = [
      '<b>Команды</b>',
      '/shop — открыть каталог',
      '/orders — мои заказы',
      '/support — написать в поддержку',
      '/delivery — доставка и оплата',
    ];
    if (isAdmin(ctx.from.id)) lines.push('', '<b>Админ</b>', '/admin — панель', '/orders — заказы магазина', '/stats — статистика');
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('delivery', async (ctx) => {
    await ctx.reply(DELIVERY_TEXT, { parse_mode: 'HTML', reply_markup: shopKeyboard() });
  });

  bot.command('support', async (ctx) => {
    await ctx.reply(
      'Напишите вопрос прямо здесь — ответит менеджер. Обычно отвечаем в течение рабочего дня.',
      { reply_markup: shopKeyboard() },
    );
  });

  bot.command('orders', async (ctx) => {
    const orders = userOrders(ctx.from.id).slice(0, 10);
    if (!orders.length) {
      return ctx.reply('Заказов пока нет. Загляните в каталог 🍸', { reply_markup: shopKeyboard() });
    }
    const text = orders
      .map((o) => `<b>${o.number}</b> · ${dateTime(o.createdAt)}\n${statusLabel(o.status)} · ${money(o.total)}`)
      .join('\n\n');
    await ctx.reply(`<b>Ваши заказы</b>\n\n${text}`, { parse_mode: 'HTML', reply_markup: shopKeyboard() });
  });

  bot.callbackQuery('u:delivery', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(DELIVERY_TEXT, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('u:support', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('Напишите ваш вопрос сообщением — менеджер ответит здесь же и в приложении.');
  });

  // ─── текстовые сообщения ──────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    if (isAdmin(ctx.from.id)) {
      // ответ клиенту через reply на пересланное сообщение
      const replyTo = ctx.message.reply_to_message?.message_id;
      const map = db.settings.replyMap || {};
      const target = replyTo ? map[`${ctx.chat.id}:${replyTo}`] : null;
      if (target) {
        addAdminMessage(target, text, { name: ctx.from.first_name });
        await notifyUser(target, `🛎 <b>Поддержка</b>\n\n${esc(text)}`);
        return ctx.reply(`✅ Отправлено: ${esc(userTitle(target))}`, { parse_mode: 'HTML' });
      }
      if (await admin.handleAdminText(ctx)) return;
      if (adminPending(ctx.from.id)) return;
      return ctx.reply('Команда не распознана. Панель управления — /admin');
    }

    // сообщение клиента → в чат поддержки
    addUserMessage(ctx.from, text, { source: 'bot' });
    await ctx.reply('Приняли! Менеджер ответит здесь и в чате поддержки внутри приложения.', {
      reply_markup: shopKeyboard(),
    });
  });

  bot.on('message', async (ctx) => {
    if (isAdmin(ctx.from?.id)) return;
    if (ctx.message?.text) return;
    addUserMessage(ctx.from, '[вложение отправлено в чат бота]', { source: 'bot' });
    await notifyAdmins(
      `📎 <b>${esc(userTitle(ctx.from.id))}</b> прислал(а) вложение в бот — посмотрите в диалоге с ботом.`,
    );
  });

  // ─── реакции на события магазина ──────────────────────────────
  events.on('order:created', async (order) => {
    const kb = new InlineKeyboard().text('📦 Открыть заказ', `a:order:${order.id}`);
    if (order.invoiceNumber && appUrl()) kb.row().url('🧾 Счёт', invoiceSummary(order).url);
    await notifyAdmins(`🆕 <b>Новый заказ</b>\n\n${orderCard(order)}`, kb);

    const userText = order.paymentMethod === 'invoice'
      ? [
        `🧾 Заказ <b>${order.number}</b> оформлен.`,
        '',
        `Счёт № <b>${esc(order.invoiceNumber)}</b> на сумму <b>${money(order.total)}</b> сформирован.`,
        'Скачать его можно в приложении, в разделе «Заказы». Менеджер свяжется с вами для подтверждения.',
      ].join('\n')
      : [
        `🛒 Заказ <b>${order.number}</b> на сумму <b>${money(order.total)}</b> создан.`,
        order.paymentStatus === 'paid' ? '' : 'Ожидаем оплату — статус обновится автоматически.',
      ].filter(Boolean).join('\n');
    await notifyUser(order.userId, userText);
  });

  events.on('order:paid', async (order) => {
    await notifyAdmins(
      `💰 <b>Оплачен заказ ${esc(order.number)}</b> · ${money(order.total)}\n${esc(userTitle(order.userId))}`,
      new InlineKeyboard().text('📦 Открыть заказ', `a:order:${order.id}`),
    );
    await notifyUser(order.userId, statusMessage(order));
  });

  events.on('support:user-message', async ({ userId, message }) => {
    const thread = getThread(userId, false);
    const kb = new InlineKeyboard()
      .text('✍️ Ответить', `a:reply:${userId}`)
      .text('💬 Диалог', `a:thread:${userId}`);
    const source = message.source === 'bot' ? ' (из чата бота)' : ' (из приложения)';
    const head = `💬 <b>${esc(userTitle(userId))}</b>${source}\n<code>${userId}</code>`;
    const body = `\n\n${esc(message.text)}`;
    const context = message.context ? `\n\n<i>Контекст: ${esc(message.context)}</i>` : '';

    for (const adminId of config.telegram.adminIds) {
      try {
        const sent = await bot.api.sendMessage(adminId, head + body + context, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
        db.settings.replyMap = db.settings.replyMap || {};
        db.settings.replyMap[`${adminId}:${sent.message_id}`] = Number(userId);
        // храним только последние 500 связок
        const keys = Object.keys(db.settings.replyMap);
        if (keys.length > 500) delete db.settings.replyMap[keys[0]];
        save();
      } catch (err) {
        console.warn('[bot] не доставлено админу:', err.message);
      }
    }
    if (thread?.messages.length === 1) {
      await notifyUser(userId, 'Спасибо за обращение! Менеджер ответит в ближайшее время.');
    }
  });

  return bot;
}

export async function startBot() {
  const instance = createBot();
  if (!instance) return null;

  await instance.api.setMyCommands([
    { command: 'shop', description: 'Каталог' },
    { command: 'orders', description: 'Мои заказы' },
    { command: 'support', description: 'Поддержка' },
    { command: 'delivery', description: 'Доставка и оплата' },
  ]);

  if (appUrl()) {
    try {
      await instance.api.setChatMenuButton({
        menu_button: { type: 'web_app', text: 'Магазин', web_app: { url: appUrl() } },
      });
    } catch (err) {
      console.warn('[bot] не удалось установить кнопку меню:', err.message);
    }
  }

  const me = await instance.api.getMe();
  if (!config.telegram.username) config.telegram.username = me.username;
  console.log(`[bot] запущен как @${me.username}, админов: ${config.telegram.adminIds.length}`);
  if (!config.telegram.adminIds.length) {
    console.warn('[bot] ADMIN_IDS пуст — админ-панель и уведомления недоступны');
  }

  instance.start({
    drop_pending_updates: true,
    onStart: () => console.log('[bot] получаю обновления (long polling)'),
  });
  return instance;
}
