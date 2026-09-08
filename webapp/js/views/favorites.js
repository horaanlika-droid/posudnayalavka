/** Избранное. */
import { h, tap, emptyState } from '../ui.js';
import { navigate } from '../router.js';
import { favoriteProducts, state } from '../state.js';
import { productCard, productRow } from '../components.js';

export default function favoritesView() {
  const items = favoriteProducts();

  if (!items.length) {
    const hits = state.products.filter((p) => p.isHit).slice(0, 10);
    return {
      title: 'Избранное',
      tab: 'favorites',
      content: h('div',
        emptyState({
          emoji: '🤍',
          title: 'Пока пусто',
          text: 'Нажимайте на сердечко в карточке товара — позиции появятся здесь',
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '8px' } }, 'В каталог'),
            () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' })),
        }),
        hits.length ? h('div', h('.row-head', h('h2', 'Может понравиться')), productRow(hits)) : null),
    };
  }

  return {
    title: 'Избранное',
    tab: 'favorites',
    content: h('div', { style: { paddingTop: '14px' } },
      h('.tiny.muted', { style: { padding: '0 20px 10px' } }, `${items.length} позиций`),
      h('.product-grid', ...items.map((p) => productCard(p)))),
  };
}
