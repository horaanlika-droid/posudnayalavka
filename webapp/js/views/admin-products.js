/** Админка: список товаров с поиском, фильтрами и переходом в редактор. */
import { h, tap, money, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

const FILTERS = [
  { id: 'all', title: 'Все' },
  { id: 'hidden', title: 'Скрытые' },
  { id: 'oos', title: 'Нет в наличии' },
  { id: 'custom', title: 'Свои' },
  { id: 'edited', title: 'С правками' },
];

const catTitle = (id) => state.categories.find((c) => c.id === id)?.title || id;

export default function adminProductsView() {
  const denied = adminGuard('Товары');
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
      const res = await api.adminProducts(query, filter);
      list.innerHTML = '';
      count.textContent = `${res.products.length} позиций`;
      if (!res.products.length) {
        list.append(emptyState({ emoji: '🔍', title: 'Ничего не нашлось', text: 'Измените запрос или фильтр' }));
        return;
      }
      for (const p of res.products) list.append(productRow(p));
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState({ emoji: '⚠️', title: 'Ошибка загрузки', text: err.message }));
    }
  }

  function productRow(p) {
    const dot = p.hidden ? 'hidden' : p.outOfStock ? 'oos' : 'ok';
    const dotTitle = p.hidden ? 'скрыт' : p.outOfStock ? 'нет в наличии' : 'в продаже';
    return tap(h('.ap-row',
      p.image
        ? h('img.ap-thumb', { src: p.image, alt: '', loading: 'lazy' })
        : h('.ap-thumb.ap-thumb-empty', '🍸'),
      h('.ap-body',
        h('.ap-name', p.name),
        h('.ap-sub', `Арт. ${p.article} · ${catTitle(p.category)}${p.custom ? ' · свой' : ''}`)),
      h('.ap-right',
        h('.ap-price', money(p.price)),
        h('.ap-status', h('.ap-dot', { class: dot }), h('span', dotTitle)))),
    () => navigate('admin-product', { id: p.id, product: p }));
  }

  const searchInput = h('input', { placeholder: 'Поиск по названию или артикулу…', type: 'search' });
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
    title: 'Товары',
    tab: 'profile',
    content: h('div',
      h('div', { style: { padding: '12px 16px 0' } },
        h('.searchbar', h('span', { html: icon('search', 17) }), searchInput)),
      pills,
      count,
      h('div', { style: { padding: '8px 16px 0' } }, list)),
    onReturn: load,
    navRight: tap(h('button.nav-btn.icon', { html: icon('plus', 22) }),
      () => navigate('admin-product', { id: 'new' })),
  };
}
