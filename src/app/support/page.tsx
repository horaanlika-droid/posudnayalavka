"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/Topbar";
import type { SupportMessage } from "@/lib/types";

function useStartFlag(): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    setFlag(new URLSearchParams(window.location.search).get("start") === "1");
  }, []);
  return flag;
}

export default function SupportPage() {
  const autoStart = useStartFlag();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [startText, setStartText] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const scrollDown = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  // Load messages
  const loadMessages = useCallback(async (tid: string) => {
    try {
      const r = await fetch(`/api/support/messages?threadId=${encodeURIComponent(tid)}`);
      const d = await r.json();
      if (r.ok) {
        setMessages(d.messages);
        scrollDown();
      }
    } catch {}
  }, []);

  // poll for new messages while open
  useEffect(() => {
    if (!open || !threadId) return;
    pollRef.current = setInterval(() => loadMessages(threadId), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, threadId, loadMessages]);

  useEffect(scrollDown, [messages]);

  const startChat = async () => {
    const res = await fetch("/api/support/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: name || undefined, phone: phone || undefined }),
    });
    const d = await res.json();
    if (!res.ok) return;
    setThreadId(d.threadId);
    setOpen(true);
    setMessages(d.messages);
    if (startText.trim()) {
      const s = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: d.threadId, text: startText.trim() }),
      });
      if (s.ok) loadMessages(d.threadId);
      setStartText("");
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !threadId) return;
    setInput("");
    // optimistic append
    setMessages((prev) => [
      ...prev,
      { id: "local" + Date.now(), threadId, actor: "user", text, createdAt: new Date().toISOString() },
    ]);
    await fetch("/api/support/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, text }),
    });
  };

  // ---- pre-chat welcome (Telegram "start chat" style) ----
  if (!open) {
    return (
      <>
        <Topbar back title="Поддержка" />
        <div className="section" style={{ marginTop: 14, padding: "16px var(--content-pad)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="avatar" style={{ width: 46, height: 46, fontSize: 20, flex: "none" }}>П</div>
            <div>
              <div style={{ fontWeight: 700 }}>Посудная лавка</div>
              <div className="muted" style={{ fontSize: 13 }}>онлайн</div>
            </div>
          </div>
          <p style={{ margin: "14px 0", lineHeight: 1.5 }}>
            Здравствуйте! Напишите нам — поможем с выбором, заказом и оплатой. Обычно отвечаем в течение рабочего дня.
          </p>
          <div className="field" style={{ marginBottom: 10 }}>
            <input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <input placeholder="Телефон (необязательно)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {autoStart && (
            <textarea
              rows={3}
              placeholder="Ваш вопрос…"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              style={{ width: "100%", background: "var(--bg-pill)", color: "var(--text)", border: "none", borderRadius: 12, padding: 12, fontSize: 15, resize: "vertical", marginBottom: 12 }}
            />
          )}
          <button className="btn" onClick={startChat}>
            Начать чат
          </button>
        </div>
      </>
    );
  }

  // ---- active chat ----
  return (
    <>
      <Topbar back title="Поддержка" />
      <div className="chat" style={{ minHeight: "calc(100dvh - 210px)" }}>
        <div className="date-divider">сегодня</div>
        {messages.map((m) => (
          <div key={m.id} className={m.actor === "user" ? "bubble out" : "bubble in"}>
            {m.text}
            <time>{fmtTime(m.createdAt)}</time>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-inputbar" style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, maxWidth: 480, margin: "0 auto" }}>
        <textarea
          rows={1}
          placeholder="Сообщение"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="send" onClick={send} aria-label="Отправить">
          <span style={{ fontSize: 22, lineHeight: 1 }}>➤</span>
        </button>
      </div>
    </>
  );
}
