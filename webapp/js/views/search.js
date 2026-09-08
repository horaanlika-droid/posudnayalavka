/** Поиск по каталогу с подсказками. */
import { h, tap, emptyState, money } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, searchProducts } from '../state.js';
import { productCard } from '../components.js';

const RECENT_KEY = 'pl.recent-search';

function recent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(q) {
  const list = [q, ...recent().filter((x) => x !== q)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function searchView() {
  const results = h('div');
  const input = h('input', { placeholder: 'Название, артикул или объём', type: 'search', autofocus: true });

  function renderSuggestions() {
    results.innerHTML = '';
    const rec = recent();
    if (rec.length) {
      results.append(h('.section',
        h('.section-title', 'Недавние запросы'),
        h('.chips', { style: { flexWrap: 'wrap' } }, ...rec.map((q) =>
          tap(h('button.pill', q), () => { input.value = q; run(); })))));
    }
    results.append(h('.section',
      h('.section-title', 'Категории'),
      h('.chips', { style: { flexWrap: 'wrap' } }, ...state.categories.map((c) =>
        tap(h('button.pill', c.title), () => navigate('catalog', { category: c.id }))))));
  }

  function run() {
    const q = input.value.trim();
    if (!q) return renderSuggestions();
    const list = searchProducts(q);
    results.innerHTML = '';
    if (!list.length) {
      results.append(emptyState({ emoji: '🔍', title: 'Ничего не нашлось', text: `По запросу «${q}» нет позиций` }));
      return;
    }
    results.append(
      h('.tiny.muted', { style: { padding: '14px 20px 8px' } }, `Найдено: ${list.length}`),
      h('.product-grid', ...list.map((p) => productCard(p))),
    );
  }

  input.addEventListener('input', run);
  input.addEventListener('change', () => { if (input.value.trim()) pushRecent(input.value.trim()); });

  renderSuggestions();

  return {
    title: 'Поиск',
    tabbar: false,
    content: h('div',
      h('div', { style: { padding: '10px 16px 0' } },
        h('.searchbar', h('span', { html: icon('search', 17) }), input)),
      results),
    onMount: () => setTimeout(() => input.focus(), 120),
  };
}
