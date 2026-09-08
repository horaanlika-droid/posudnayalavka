/** Чат поддержки: сообщения уходят администратору в бот, ответы приходят сюда. */
import { h, tap, timeShort, dayLabel, toast } from '../ui.js';
import { icon } from '../icons.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state } from '../state.js';

const QUICK = [
  'Нужен подбор бокалов под коктейльную карту',
  'Хочу счёт для юрлица',
  'Сроки доставки в мой город?',
  'Есть ли скидка на объём?',
];

export default function supportView({ prefill = '' } = {}) {
  const body = h('.chat-body');
  const textarea = h('textarea', { placeholder: 'Сообщение…', rows: 1, value: prefill });
  const sendBtn = h('button.chat-send', { html: icon('send', 19), disabled: !prefill.trim() });

  let lastAt = 0;
  let poll = null;
  let lastDay = '';

  function appendMessage(m, animate = true) {
    const day = dayLabel(m.at);
    if (day !== lastDay) {
      lastDay = day;
      body.append(h('.chat-day', day));
    }
    const cls = m.from === 'user' ? 'out' : m.from === 'system' ? 'system' : 'in';
    const bubble = h('.bubble', { class: cls },
      h('span', m.text),
      m.from === 'system' ? null : h('span.bubble-time', timeShort(m.at)));
    if (!animate) bubble.style.animation = 'none';
    body.append(bubble);
    lastAt = Math.max(lastAt, m.at);
  }

  function scrollDown(smooth = false) {
    body.scrollTo({ top: body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  async function load() {
    try {
      const res = await api.support();
      body.innerHTML = '';
      lastDay = '';
      if (!res.messages.length) {
        body.append(h('.bubble.system',
          'Здравствуйте! Это чат с менеджером «Посудной лавки». Подберём стекло под концепцию бара, ' +
          'рассчитаем доставку и выставим счёт. Обычно отвечаем в течение рабочего дня.'));
        body.append(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px', justifyContent: 'center', margin: '10px 0' } },
          ...QUICK.map((q) => tap(h('button.pill', q), () => {
            textarea.value = q;
            sendBtn.disabled = false;
            send();
          }))));
      } else {
        for (const m of res.messages) appendMessage(m, false);
      }
      scrollDown();
    } catch (err) {
      body.append(h('.bubble.system', `Не удалось загрузить историю: ${err.message}`));
    }
  }

  async function send() {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;
    appendMessage({ from: 'user', text, at: Date.now() });
    scrollDown(true);
    tg.haptic('light');
    try {
      await api.sendSupport(text);
    } catch (err) {
      toast(`Сообщение не отправлено: ${err.message}`, 3000);
    }
  }

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
    sendBtn.disabled = !textarea.value.trim();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  });
  tap(sendBtn, send);

  async function pollUpdates() {
    try {
      const res = await api.supportUpdates(lastAt);
      for (const m of res.messages) {
        if (m.from === 'user') continue; // свои уже отрисованы
        appendMessage(m);
        tg.haptic('light');
      }
      if (res.messages.some((m) => m.from !== 'user')) scrollDown(true);
    } catch {}
  }

  const screenContent = h('div', { style: { display: 'contents' } }, body, h('.chat-input', textarea, sendBtn));

  return {
    title: 'Поддержка',
    tabbar: false,
    classes: ['chat-screen'],
    content: screenContent,
    onMount: async () => {
      await load();
      poll = setInterval(pollUpdates, 4000);
      if (prefill) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
        setTimeout(() => textarea.focus(), 200);
      }
    },
    onDestroy: () => clearInterval(poll),
  };
}
