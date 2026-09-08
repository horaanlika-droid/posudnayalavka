/** Каталог: категории-чипсы, поиск, сортировка и фильтры. */
import { h, tap, sheet, section, money, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, searchProducts } from '../state.js';
import { productCard } from '../components.js';

const SORTS = [
  { id: 'popular', title: 'Сначала популярные' },
  { id: 'cheap', title: 'Сначала дешёвые' },
  { id: 'expensive', title: 'Сначала дорогие' },
  { id: 'volume', title: 'По объёму' },
  { id: 'name', title: 'По названию' },
];

const filters = { sort: 'popular', onlyNew: false, onlyAvailable: false, maxPrice: 0 };

function sortProducts(list) {
  const arr = [...list];
  switch (filters.sort) {
    case 'cheap': return arr.sort((a, b) => a.price - b.price);
    case 'expensive': return arr.sort((a, b) => b.price - a.price);
    case 'volume': return arr.sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0));
    case 'name': return arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    default:
      return arr.sort((a, b) => (Number(b.isHit) - Number(a.isHit)) || (Number(b.isNew) - Number(a.isNew)));
  }
}

export default function catalogView(params = {}) {
  let activeCategory = params.category || 'all';
  let query = params.query || '';

  const grid = h('.product-grid');
  const countLabel = h('.tiny.muted', { style: { padding: '10px 20px 0' } });
  const maxPrice = Math.max(...state.products.map((p) => p.price), 0);

  function apply() {
    let list = query ? searchProducts(query) : state.products;
    if (activeCategory !== 'all') list = list.filter((p) => p.category === activeCategory);
    if (filters.onlyNew) list = list.filter((p) => p.isNew);
    if (filters.onlyAvailable) list = list.filter((p) => !p.outOfStock);
    if (filters.maxPrice) list = list.filter((p) => p.price <= filters.maxPrice);
    list = sortProducts(list);

    grid.innerHTML = '';
    if (!list.length) {
      grid.style.display = 'block';
      grid.append(emptyState({ emoji: '🔍', title: 'Ничего не нашлось', text: 'Попробуйте изменить запрос или сбросить фильтры' }));
    } else {
      grid.style.display = '';
      for (const p of list) grid.append(productCard(p));
    }
    countLabel.textContent = `${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? 'позиция' : 'позиций'}`;
  }

  const chips = h('.chips');
  const chipEls = new Map();
  const makeChip = (id, title) => {
    const el = h('button.pill', { class: activeCategory === id ? 'active' : '' }, title);
    tap(el, () => {
      activeCategory = id;
      for (const [key, node] of chipEls) node.classList.toggle('active', key === id);
      apply();
      document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 'select');
    chipEls.set(id, el);
    return el;
  };
  chips.append(makeChip('all', 'Все'));
  for (const c of state.categories) chips.append(makeChip(c.id, c.title));

  const searchInput = h('input', { placeholder: 'Поиск по каталогу…', value: query, type: 'search' });
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    apply();
  });

  function openFilters() {
    const priceLabel = h('.cell-value', filters.maxPrice ? `до ${money(filters.maxPrice)}` : 'любая');
    const range = h('input', {
      type: 'range', min: 200, max: Math.ceil(maxPrice / 100) * 100, step: 50,
      value: filters.maxPrice || maxPrice,
      style: { width: '100%', accentColor: 'var(--accent)' },
    });
    range.addEventListener('input', () => {
      filters.maxPrice = Number(range.value) >= maxPrice ? 0 : Number(range.value);
      priceLabel.textContent = filters.maxPrice ? `до ${money(filters.maxPrice)}` : 'любая';
    });

    const toggleRow = (title, key) => {
      const sw = h('.switch', { class: filters[key] ? 'on' : '' });
      const row = h('.cell', h('.cell-body', h('.cell-title', title)), sw);
      tap(row, () => {
        filters[key] = !filters[key];
        sw.classList.toggle('on', filters[key]);
      }, 'select');
      return row;
    };

    const sortCells = SORTS.map((s) => {
      const check = h('span', { style: { color: 'var(--accent)', opacity: filters.sort === s.id ? 1 : 0 }, html: icon('check', 18) });
      const row = h('.cell.tappable', h('.cell-body', h('.cell-title', s.title)), check);
      tap(row, () => {
        filters.sort = s.id;
        for (const [i, el] of sortCells.entries()) {
          el.querySelector('span:last-child').style.opacity = SORTS[i].id === s.id ? 1 : 0;
        }
      }, 'select');
      return row;
    });

    const { close } = sheet({
      title: 'Фильтры',
      body: h('div',
        section('Сортировка', h('.group', ...sortCells)),
        section('Показывать', h('.group', toggleRow('Только новинки', 'onlyNew'), toggleRow('Только в наличии', 'onlyAvailable'))),
        section('Цена',
          h('.group',
            h('.cell', h('.cell-body', h('.cell-title', 'Максимальная цена')), priceLabel),
            h('.cell', { style: { padding: '6px 14px 14px' } }, range))),
      ),
      actions: h('div', { style: { display: 'flex', gap: '10px' } },
        tap(h('button.btn.secondary', 'Сбросить'), () => {
          filters.sort = 'popular';
          filters.onlyNew = false;
          filters.onlyAvailable = false;
          filters.maxPrice = 0;
          apply();
          close();
        }),
        tap(h('button.btn', 'Показать'), () => { apply(); close(); })),
    });
  }

  const head = h('.catalog-head',
    h('.hstack',
      h('.searchbar', { style: { flex: '1' } }, h('span', { html: icon('search', 17) }), searchInput),
      tap(h('button.nav-btn.icon', { html: icon('sliders', 22) }), openFilters)),
    chips);

  apply();

  return {
    title: activeCategory === 'all' ? 'Каталог' : state.categories.find((c) => c.id === activeCategory)?.title || 'Каталог',
    tab: 'catalog',
    content: h('div', head, countLabel, h('div', { style: { paddingTop: '10px' } }, grid)),
  };
}
