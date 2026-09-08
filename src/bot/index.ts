import { Bot } from "grammy";
import { env } from "@/lib/env";
import { readStore } from "@/lib/db";
import {
  adminOrdersText,
  advanceOrder,
  resolveOrder,
  sendOrderCard,
  threadForMessage,
} from "@/lib/admin";
import { addSupportMessage, getThreadMessages, listThreads } from "@/lib/support";
import { getOrder } from "@/lib/orders";
import { PRODUCTS, CATEGORIES } from "@/data/catalog";

async function main() {
  if (!env.botToken) {
    console.warn("BOT_TOKEN not set — bot not started. Fill env on host.");
    return;
  }

  const bot = new Bot(env.botToken);
  const isAdmin = (ctx: { from?: { id?: number } | null }) =>
    env.adminId ? ctx.from?.id === env.adminId : false;

  // ---------- COMMANDS ----------
  bot.command("start", async (ctx) => {
    await ctx.reply(
      `👋 Здравствуй! Это админ-панель «Посудной лавки».\n\n` +
        `Команды:\n` +
        `/orders — активные заказы\n` +
        `/order N — карточка заказа №N\n` +
        `/catalog — сводка каталога\n` +
        `/threads — чаты поддержки\n` +
        `/help — помощь`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `Управление:\n/orders — активные заказы\n/order 12 — по номеру\n/order <id> — по внутреннему id\n` +
        `/catalog — сводка каталога\n/threads — чаты поддержки\n\n` +
        `В карточке заказа кнопки «Дальше по статусу» и «Отменить».\n` +
        `Ответ реплаем на сообщение клиента из поддержки уходит ему в чат на сайте.`,
    );
  });

  bot.command("orders", async (ctx) => {
    const text = await adminOrdersText();
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.command("catalog", async (ctx) => {
    const cats = CATEGORIES.filter((c) => c.id !== "all")
      .map(
        (c) =>
          `${c.emoji} ${c.title}: ${PRODUCTS.filter((p) => p.category === c.id).length}`,
      )
      .join("\n");
    await ctx.reply(`📦 Каталог: ${PRODUCTS.length} товаров\n\n${cats}`);
  });

  bot.command("threads", async (ctx) => {
    const threads = await listThreads();
    if (!threads.length) {
      await ctx.reply("Чатов поддержки пока нет.");
      return;
    }
    const lines = threads
      .slice(0, 15)
      .map((t) => {
        const who = t.customerName ?? t.phone ?? "аноним";
        const time = new Date(t.lastActivity).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `• ${who} · ${time}`;
      })
      .join("\n");
    await ctx.reply(
      `💬 Чаты поддержки (${threads.length}):\n\n${lines}\n\nОткрыть: /chat <id>`,
    );
  });

  bot.command("chat", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("Нет доступа.");
      return;
    }
    const arg = ctx.match.trim();
    const store = await readStore();
    if (!store.supportThreads[arg]) {
      await ctx.reply("Такого чата нет. Смотрите /threads");
      return;
    }
    const msgs = await getThreadMessages(arg);
    const last = msgs
      .slice(-8)
      .map((m) => `${m.actor === "user" ? "👤" : m.actor === "admin" ? "🛠" : "🤖"} ${m.text}`)
      .join("\n\n");
    await ctx.reply(`Чат ${arg.slice(0, 8)}…\n\n${last}\n\nОтвечайте реплаем на сообщение клиента.`);
  });

  bot.command("order", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("Нет доступа.");
      return;
    }
    const token = ctx.match.trim();
    const order = await resolveOrder(token);
    if (!order) {
      await ctx.reply("Заказ не найден. Пример: /order 12");
      return;
    }
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await sendOrderCard(chatId, order);
  });

  // ---------- INLINE BUTTONS: order status flow ----------
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data; // st:<id>:next | st:<id>:cancelled
    const [prefix, orderId, action] = data.split(":");
    if (prefix !== "st") {
      await ctx.answerCallbackQuery({ text: "Неизвестно" });
      return;
    }
    const order = await getOrder(orderId);
    if (!order) {
      await ctx.answerCallbackQuery({ text: "Заказ не найден" });
      return;
    }
    const target = action === "cancelled" ? ("cancelled" as const) : undefined;
    const updated = await advanceOrder(orderId, target);
    const chatId = ctx.chat?.id;
    if (updated && chatId != null) await sendOrderCard(chatId, updated);
    await ctx.answerCallbackQuery({ text: "Обновлено" });
  });

  // ---------- SUPPORT: admin reply to a customer ----------
  bot.on("message", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const text = ctx.message.text;
    const replied = ctx.message.reply_to_message;
    if (!text || !replied) return;

    // Map the replied-to Telegram message back to a web thread.
    const threadId = await threadForMessage(replied.message_id);
    if (!threadId) return;

    await addSupportMessage({
      threadId,
      actor: "admin",
      senderName: "Оператор",
      text: text.slice(0, 2000),
    });
    await ctx.reply("✅ Ответ отправлен клиенту в чат на сайте.");
  });

  // ---- transport ----
  if (env.botMode === "webhook") {
    console.log("Bot configured for webhook mode. Set the webhook externally (see README).");
  } else {
    await bot.start({
      onStart: (me) => console.log(`Bot @${me.username} started (polling)`),
      drop_pending_updates: true,
    });
  }
}

main().catch((e) => {
  console.error("Bot fatal:", e);
  process.exit(1);
});
