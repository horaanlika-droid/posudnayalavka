/** Админка: заказы — фильтры, поиск, смена статуса. */
import { h, tap, money, section, group, toast, sheet, emptyState, dateShort, timeShort } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

const FILTERS = [
  { id: 'all', title: 'Все' },
  { id: 'open', title: 'Активные' },
  { id: 'paid', title: 'Оплаченные' },
  { id: 'invoice', title: 'По счёту' },
];

const FLOW = ['paid', 'packing', 'shipped', 'done'];

function statusChip(st) {
  const meta = state.config?.statuses?.[st] || {};
  return h('.status-chip', `${meta.emoji || ''} ${meta.title || st}`);
}

export default function adminOrdersView() {
  const denied = adminGuard('Заказы');
  if (denied) return denied;

  let query = '';
  let filter = 'all';
  let timer = null;

  const list = h('div');
  const count = h('.tiny.muted', { style: { padding: '10px 20px 0' } });

  async function load() {
    list.innerHTML = '';
    list.append(h('div', { style: { padding: '30px 0', display: 'flex', justifyContent: 'center' } }, h('.spinner')));
    try {
      const res = await api.adminOrders(query, filter);
      list.innerHTML = '';
      count.textContent = `Показано ${res.orders.length} из ${res.total}`;
      if (!res.orders.length) {
        list.append(emptyState({ emoji: '📦', title: 'Заказов нет', text: 'Измените запрос или фильтр' }));
        return;
      }
      for (const o of res.orders) list.append(orderRow(o));
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState({ emoji: '⚠️', title: 'Ошибка загрузки', text: err.message }));
    }
  }

  function orderRow(o) {
    return tap(h('.ap-row',
      h('.ap-body',
        h('.ap-name', `${o.number} · ${money(o.total)}`),
        h('.ap-sub', `${o.customer?.name || ''} · ${o.customer?.phone || ''}`),
        h('.ap-sub', `${dateShort(o.createdAt)}, ${timeShort(o.createdAt)}${o.paymentMethod === 'invoice' ? ' · 🧾 счёт' : ''}`)),
      h('.ap-right', statusChip(o.status))),
    () => openOrder(o));
  }

  function openOrder(o) {
    const meta = state.config?.statuses || {};
    const items = o.items.map((it) =>
      h('.cell',
        it.image ? h('img.ap-thumb', { src: it.image, alt: '', loading: 'lazy', style: { width: '40px', height: '40px' } }) : null,
        h('.cell-body', h('.cell-title', it.name), h('.cell-sub', `Арт. ${it.article} × ${it.qty}`)),
        h('.cell-value', money(it.price * it.qty))));

    const statusBtns = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
    for (const st of FLOW) {
      if (st === o.status) continue;
      statusBtns.append(tap(h('button.btn.small.secondary', `${meta[st]?.emoji || ''} ${meta[st]?.title || st}`),
        () => changeStatus(o, st, dlg)));
    }
    if (o.status !== 'canceled') {
      statusBtns.append(tap(h('button.btn.small.danger', 'Отменить'), () => changeStatus(o, 'canceled', dlg)));
    }

    const dlg = sheet({
      title: `Заказ ${o.number}`,
      body: h('div',
        section('', group(h('.cell', h('.cell-body', h('.cell-title', 'Статус')), statusChip(o.status)))),
        section('Состав', group(...items,
          h('.cell', h('.cell-body', h('.cell-title', 'Доставка')), h('.cell-value', o.shipping ? money(o.shipping) : 'бесплатно')),
          h('.cell', h('.cell-body', h('.cell-title', 'Итого')), h('.cell-value', h('b', money(o.total)))))),
        section('Клиент', group(
          h('.cell', h('.cell-body', h('.cell-title', o.customer?.name || '—'), h('.cell-sub', `${o.customer?.phone || ''}${o.customer?.email ? ` · ${o.customer.email}` : ''}`))),
          h('.cell', h('.cell-body', h('.cell-title', 'Telegram'), h('.cell-sub', `${o.userTitle || ''} · ID ${o.userId}`))),
          h('.cell', h('.cell-body', h('.cell-title', o.delivery?.methodTitle || 'Доставка'), h('.cell-sub', [o.delivery?.city, o.delivery?.address].filter(Boolean).join(', ') || '—'))),
          o.comment ? h('.cell', h('.cell-body', h('.cell-title', 'Комментарий'), h('.cell-sub', o.comment))) : null,
        )),
        o.company ? section('Юрлицо', group(
          h('.cell', h('.cell-body', h('.cell-title', o.company.name || '—'), h('.cell-sub', `ИНН ${o.company.inn || '—'}${o.company.kpp ? ` · КПП ${o.company.kpp}` : ''}`))),
          o.invoiceNumber ? h('.cell', h('.cell-body', h('.cell-title', `Счёт ${o.invoiceNumber}`))) : null,
        )) : null,
        section('Сменить статус', statusBtns)),
    });
  }

  async function changeStatus(o, status, dlg) {
    try {
      await api.adminSetOrderStatus(o.id, status);
      dlg.close();
      toast(`Заказ ${o.number}: ${state.config?.statuses?.[status]?.title || status}`);
      load();
    } catch (err) {
      toast(err.message || 'Ошибка', 3000);
    }
  }

  const searchInput = h('input', { placeholder: 'Номер, имя, телефон, ИНН…', type: 'search' });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  });

  const pills = h('.chips', { style: { padding: '12px 16px 0' } });
  const pillEls = new Map();
  for (const f of FILTERS) {
    const el = h('button.pill', { class: f.id === filter ? 'active' : '' }, f.title);
    tap(el, () => {
      filter = f.id;
      for (const [key, node] of pillEls) node.classList.toggle('active', key === f.id);
      load();
    }, 'select');
    pillEls.set(f.id, el);
    pills.append(el);
  }

  load();

  return {
    title: 'Заказы',
    tab: 'profile',
    content: h('div',
      h('div', { style: { padding: '12px 16px 0' } },
        h('.searchbar', h('span', { html: icon('search', 17) }), searchInput)),
      pills,
      count,
      h('div', { style: { padding: '8px 16px 0' } }, list)),
    onReturn: load,
  };
}
