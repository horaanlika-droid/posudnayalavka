/** Админка: диалоги поддержки. */
import { h, tap, section, group, cell, emptyState, timeShort, spinnerBlock } from '../ui.js';
import { navigate } from '../router.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

export default function adminSupportView() {
  const denied = adminGuard('Поддержка');
  if (denied) return denied;

  const box = h('div');

  async function load() {
    box.innerHTML = '';
    box.append(spinnerBlock('Загружаем диалоги…'));
    try {
      const { threads } = await api.adminThreads();
      box.innerHTML = '';
      if (!threads.length) {
        box.append(emptyState({ emoji: '💬', title: 'Обращений пока нет' }));
        return;
      }
      box.append(section(`Диалоги · ${threads.length}`, group(
        ...threads.map((t) => {
          const last = t.lastMessage;
          const preview = last ? `${last.from === 'user' ? '👤 ' : last.from === 'admin' ? '🛎 ' : ''}${(last.text || '').slice(0, 60)}` : 'Нет сообщений';
          return tap(h('.ap-row',
            h('.avatar', { style: { width: '44px', height: '44px', fontSize: '17px' } },
              (t.title || '?').slice(0, 1).toUpperCase()),
            h('.ap-body',
              h('.ap-name', `${t.unreadAdmin ? '🔴 ' : ''}${t.title}`),
              h('.ap-sub', preview)),
            h('.ap-right',
              h('.ap-sub', timeShort(t.updatedAt)),
              t.unreadAdmin ? h('.unread-badge', String(t.unreadAdmin)) : null)),
          () => navigate('admin-thread', { userId: t.userId, title: t.title }));
        }),
      )));
    } catch (err) {
      box.innerHTML = '';
      box.append(emptyState({ emoji: '⚠️', title: 'Ошибка загрузки', text: err.message }));
    }
  }

  load();

  return {
    title: 'Поддержка',
    tab: 'profile',
    content: box,
    onReturn: load,
  };
}
