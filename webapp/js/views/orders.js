/** Список заказов пользователя. */
import { h, tap, money, emptyState, dateShort, timeShort, spinnerBlock } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { api } from '../api.js';
import { state, updateOrdersCache } from '../state.js';

export function statusChip(order) {
  const meta = state.config?.statuses?.[order.status] || { title: order.status, emoji: '' };
  return h('span.status-chip', { class: order.status }, `${meta.emoji} ${meta.title}`);
}

export function orderCard(order) {
  const card = h('.order-card',
    h('.order-head',
      h('.order-num', order.number),
      statusChip(order)),
    h('.tiny.muted', { style: { marginTop: '3px' } },
      `${dateShort(order.createdAt)}, ${timeShort(order.createdAt)} · ${order.items.length} поз.`),
    h('.order-thumbs', ...order.items.slice(0, 5).map((it) =>
      h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '', loading: 'lazy' }) : null))),
    h('.order-foot',
      h('span', order.paymentMethod === 'invoice' ? 'Счёт для юрлица' : 'Оплата картой'),
      h('span', { style: { color: 'var(--label)', fontWeight: '600' } }, money(order.total))),
  );
  tap(card, () => navigate('order', { id: order.id }));
  return card;
}

export default function ordersView() {
  const list = h('div', spinnerBlock('Загружаем заказы…'));

  async function load() {
    try {
      const res = await api.orders();
      updateOrdersCache(res.orders);
      list.innerHTML = '';
      if (!res.orders.length) {
        list.append(emptyState({
          emoji: '📦',
          title: 'Заказов пока нет',
          text: 'Соберите первый заказ — мы отгрузим его за 1–2 дня',
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '8px' } }, 'В каталог'),
            () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' })),
        }));
        return;
      }
      list.append(h('div', { style: { paddingTop: '14px' } }, ...res.orders.map(orderCard)));
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState({ emoji: '⚠️', title: 'Не удалось загрузить', text: err.message }));
    }
  }

  return {
    title: 'Мои заказы',
    tabbar: false,
    content: list,
    onMount: load,
  };
}
