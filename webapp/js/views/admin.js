/** Админ-панель: сводка и разделы управления магазином. */
import { h, tap, money, section, group, cell, spinnerBlock } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, refresh } from '../router.js';
import { state } from '../state.js';
import { api } from '../api.js';

/** Заглушка для экранов, недоступных не-админам. */
export function adminGuard(title = 'Админ-панель') {
  if (state.config?.isAdmin) return null;
  return {
    title,
    content: h('.empty',
      h('.emoji', '🔒'),
      h('h3', 'Нет доступа'),
      h('p', 'Раздел доступен только администраторам')),
  };
}

function statCard(value, label) {
  return h('.admin-stat', h('b', value), h('span', label));
}

export default function adminView() {
  const denied = adminGuard();
  if (denied) return denied;

  const box = h('div', spinnerBlock('Загружаем сводку…'));

  async function load() {
    try {
      const res = await api.adminStats();
      const { orders, catalog, support, bestsellers } = res;
      box.innerHTML = '';

      box.append(h('.admin-stats',
        statCard(String(orders.open), 'открытых заказов'),
        statCard(String(orders.today), 'заказов за сутки'),
        statCard(money(orders.revenue), 'выручка'),
        statCard(money(orders.avgCheck), 'средний чек'),
        statCard(String(catalog.total), `позиций · скрыто ${catalog.hidden}`),
        statCard(support.unread ? `🔴 ${support.unread}` : String(support.threads), 'диалогов в поддержке'),
      ));

      box.append(section('Управление', group(
        cell({ title: 'Товары', sub: `${catalog.total} позиций · ${catalog.custom} своих`, iconName: 'tag', chevron: true, onClick: () => navigate('admin-products') }),
        cell({ title: 'Категории', sub: `${catalog.categories} шт.`, iconName: 'grid', chevron: true, onClick: () => navigate('admin-cats') }),
        cell({ title: 'Магазин и контакты', sub: 'Бренд, доставка, реквизиты, тексты', iconName: 'store', chevron: true, onClick: () => navigate('admin-info') }),
        cell({ title: 'Заказы', sub: orders.open ? `Открытых: ${orders.open}` : 'Все обработаны ✨', iconName: 'box', chevron: true, value: orders.open ? String(orders.open) : '', onClick: () => navigate('admin-orders') }),
        cell({ title: 'Поддержка', sub: support.unread ? `Без ответа: ${support.unread}` : 'Диалоги с клиентами', iconName: 'chat', chevron: true, value: support.unread ? String(support.unread) : '', onClick: () => navigate('admin-support') }),
      )));

      if (bestsellers?.length) {
        box.append(section('Хиты продаж',
          group(...bestsellers.slice(0, 5).map((b, i) =>
            h('.cell', h('.cell-body', h('.cell-title', `${i + 1}. ${b.name}`)), h('.cell-value', `${b.qty} шт.`))))));
      }

      box.append(h('.brand-footer', h('p', 'Правки применяются мгновенно — и в витрине, и в боте')));
    } catch (err) {
      box.innerHTML = '';
      box.append(h('.empty', h('.emoji', '⚠️'), h('h3', 'Не удалось загрузить'), h('p', err.message)));
    }
  }

  load();

  return {
    title: 'Админ-панель',
    tab: 'profile',
    content: box,
    onReturn: load,
    navRight: tap(h('button.nav-btn.icon', { html: icon('refresh', 20) }), () => refresh()),
  };
}
