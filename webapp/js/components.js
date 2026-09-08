/** Переиспользуемые карточки: товар, категория, степпер количества. */
import { h, tap, money } from './ui.js';
import { icon } from './icons.js';
import { navigate } from './router.js';
import { addToCart, inCart, isFavorite, toggleFavorite, setQty, categoryCount } from './state.js';

export function productCard(p, { fixedWidth = false } = {}) {
  const media = h('.pcard-media');
  if (p.image) {
    const img = h('img', { src: p.image, alt: p.name, loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => img.classList.add('loaded'));
    if (img.complete) img.classList.add('loaded');
    media.append(img);
  }
  if (p.outOfStock) media.append(h('.badge.oos', 'Нет в наличии'));
  else if (p.isNew) media.append(h('.badge.new', 'Новинка'));
  else if (p.isHit) media.append(h('.badge', 'Хит'));

  const fav = h('button.fav-btn', { class: isFavorite(p.id) ? 'on' : '', html: icon(isFavorite(p.id) ? 'heartFill' : 'heart', 17) });
  tap(fav, (e) => {
    e.stopPropagation();
    const on = toggleFavorite(p.id);
    fav.classList.toggle('on', on);
    fav.innerHTML = icon(on ? 'heartFill' : 'heart', 17);
  }, 'select');
  media.append(fav);

  const count = inCart(p.id);
  const addBtn = h('button.add-btn', {
    class: count ? 'in-cart' : '',
    html: count ? `<b style="font-size:13px">${count}</b>` : icon('plus', 17),
  });
  tap(addBtn, (e) => {
    e.stopPropagation();
    if (p.outOfStock) return;
    addToCart(p.id);
    const n = inCart(p.id);
    addBtn.classList.add('in-cart');
    addBtn.innerHTML = `<b style="font-size:13px">${n}</b>`;
  }, 'light');

  const card = h('.pcard', { class: fixedWidth ? 'fixed-w' : '' },
    media,
    h('.pcard-body',
      h('.pcard-name', p.name),
      h('.pcard-sub', p.volumeLabel || ''),
      h('.pcard-foot',
        h('div',
          h('span.pcard-price', money(p.price)),
          p.basePrice && p.basePrice !== p.price ? h('span.pcard-old', money(p.basePrice)) : null),
        p.outOfStock ? null : addBtn)),
  );
  tap(card, () => navigate('product', { id: p.id }), 'light');
  return card;
}

export function categoryCard(category, sampleProduct) {
  const card = h('.cat-card',
    sampleProduct?.image ? h('img', { src: sampleProduct.image, alt: '', loading: 'lazy' }) : null,
    h('.cat-card-body',
      h('.cat-card-title', category.title),
      h('.cat-card-count', `${categoryCount(category.id)} позиций`)),
  );
  tap(card, () => navigate('catalog', { category: category.id }), 'light');
  return card;
}

export function qtyStepper(id, qty, onChange) {
  const label = h('span.qty', String(qty));
  const box = h('.stepper',
    tap(h('button', { html: icon('minus', 16) }), () => {
      const next = Math.max(0, Number(label.textContent) - 1);
      label.textContent = String(next);
      setQty(id, next);
      onChange?.(next);
    }, 'light'),
    label,
    tap(h('button', { html: icon('plus', 16) }), () => {
      const next = Number(label.textContent) + 1;
      label.textContent = String(next);
      setQty(id, next);
      onChange?.(next);
    }, 'light'),
  );
  return box;
}

export function productRow(items, { fixedWidth = true } = {}) {
  return h('.hscroll', ...items.map((p) => productCard(p, { fixedWidth })));
}
