import { env } from "@/lib/env";

// Minimal raw Telegram Bot API client used by the web process to push
// notifications to the admin. The interactive bot itself lives in src/bot.
// No credentials in code — everything from env.

const API = "https://api.telegram.org/bot";

export interface TgSendOpts {
  parse_mode?: "HTML" | "Markdown";
  reply_markup?: unknown;
  reply_to_message_id?: number;
}

export async function tgSend(
  chatId: number | string,
  text: string,
  opts: TgSendOpts = {},
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
  if (!env.botToken) return { ok: false, error: "BOT_TOKEN not set" };
  try {
    const res = await fetch(`${API}${env.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...opts }),
    });
    const data = (await res.json()) as { ok: boolean; result?: { message_id?: number }; description?: string };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, message_id: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
