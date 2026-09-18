/** Админка: переписка с клиентом. */
import { h, tap, timeShort, dayLabel, toast } from '../ui.js';
import { icon } from '../icons.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

export default function adminThreadView({ userId, title }) {
  const denied = adminGuard('Диалог');
  if (denied) return denied;

  const body = h('.chat-body');
  const textarea = h('textarea', { placeholder: 'Ответ клиенту…', rows: 1 });
  const sendBtn = h('button.chat-send', { html: icon('send', 19), disabled: true });

  let lastAt = 0;
  let lastDay = '';
  let poll = null;

  function appendMessage(m, animate = true) {
    const day = dayLabel(m.at);
    if (day !== lastDay) {
      lastDay = day;
      body.append(h('.chat-day', day));
    }
    const cls = m.from === 'admin' ? 'out' : m.from === 'system' ? 'system' : 'in';
    const bubble = h('.bubble', { class: cls },
      m.from === 'admin' && m.adminName ? h('div', { style: { fontSize: '12px', opacity: 0.7, marginBottom: '2px' } }, m.adminName) : null,
      h('span', m.text),
      m.from === 'system' ? null : h('span.bubble-time', timeShort(m.at)));
    if (!animate) bubble.style.animation = 'none';
    body.append(bubble);
    lastAt = Math.max(lastAt, m.at);
  }

  function scrollDown(smooth = false) {
    body.scrollTo({ top: body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  async function load(silent = false) {
    try {
      const res = await api.adminThread(userId);
      if (!silent) {
        body.innerHTML = '';
        lastDay = '';
        lastAt = 0;
      }
      let added = false;
      for (const m of res.thread.messages) {
        if (m.at > lastAt || !silent) {
          appendMessage(m, silent);
          added = true;
        }
      }
      if (added) scrollDown(silent);
    } catch (err) {
      if (!silent) body.append(h('.bubble.system', `Не удалось загрузить: ${err.message}`));
    }
  }

  async function send() {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;
    tg.haptic('light');
    try {
      const res = await api.adminReply(userId, text);
      appendMessage(res.message);
      scrollDown(true);
    } catch (err) {
      toast(`Не отправлено: ${err.message}`, 3000);
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

  return {
    title: (title || 'Диалог').slice(0, 26),
    tab: 'profile',
    tabbar: false,
    classes: ['chat-screen'],
    content: h('div', { style: { display: 'contents' } }, body, h('.chat-input', textarea, sendBtn)),
    onMount: async () => {
      await load(false);
      poll = setInterval(() => load(true), 6000);
    },
    onDestroy: () => clearInterval(poll),
  };
}
