/** Карточка товара. */
import { h, tap, money, toast, section, plural } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { product, addToCart, inCart, setQty, isFavorite, toggleFavorite, state, categoryProducts } from '../state.js';
import { productRow } from '../components.js';

export default function productView({ id }) {
  const p = product(id);
  if (!p) {
    return { title: 'Товар', content: h('.empty', h('h3', 'Товар не найден')) };
  }

  const category = state.categories.find((c) => c.id === p.category);
  const related = categoryProducts(p.category).filter((x) => x.id !== p.id).slice(0, 10);

  let qty = inCart(p.id) || 1;
  const qtyLabel = h('span.qty', String(qty));
  const totalLabel = h('span', money(p.price * qty));

  const updateTotals = () => {
    qtyLabel.textContent = String(qty);
    totalLabel.textContent = money(p.price * qty);
    if (tg.inTelegram) {
      tg.mainButton({
        text: `В корзину · ${money(p.price * qty)}`,
        visible: !p.outOfStock,
        onClick: addAction,
      });
    }
  };

  function addAction() {
    setQty(p.id, qty);
    tg.haptic('success');
    toast(`«${p.name}» × ${qty} в корзине`);
  }

  const stepper = h('.stepper', { style: { height: '46px', borderRadius: '14px' } },
    tap(h('button', { style: { width: '44px', height: '46px' }, html: icon('minus', 18) }), () => {
      qty = Math.max(1, qty - 1);
      updateTotals();
    }),
    qtyLabel,
    tap(h('button', { style: { width: '44px', height: '46px' }, html: icon('plus', 18) }), () => {
      qty += 1;
      updateTotals();
    }));

  const favBtn = h('button.nav-btn.icon', {
    class: isFavorite(p.id) ? '' : '',
    html: icon(isFavorite(p.id) ? 'heartFill' : 'heart', 22),
  });
  tap(favBtn, () => {
    const on = toggleFavorite(p.id);
    favBtn.innerHTML = icon(on ? 'heartFill' : 'heart', 22);
    toast(on ? 'Добавлено в избранное' : 'Убрано из избранного', 1400);
  }, 'select');

  const content = h('div',
    h('.product-hero',
      p.image ? h('img', { src: p.image, alt: p.name }) : null,
      p.isNew ? h('.badge.new', { style: { top: '16px', left: '16px' } }, 'Новинка')
        : p.isHit ? h('.badge', { style: { top: '16px', left: '16px' } }, 'Хит') : null),

    h('.product-info',
      h('.product-title', p.name),
      h('.product-meta',
        h('.tag', `Арт. ${p.article}`),
        p.volumeLabel ? h('.tag', p.volumeLabel) : null,
        category ? h('.tag', category.title) : null,
        p.outOfStock ? h('.tag', { style: { color: 'var(--red)' } }, 'Нет в наличии') : h('.tag', { style: { color: 'var(--green)' } }, 'В наличии')),
      h('.product-price',
        h('span.now', money(p.price)),
        p.basePrice !== p.price ? h('span.pcard-old', { style: { fontSize: '16px' } }, money(p.basePrice)) : null,
        h('span.per', 'за штуку')),
      h('p.product-desc', p.description)),

    section('Характеристики',
      h('.group',
        h('.cell', h('.cell-body', h('.cell-title', 'Артикул')), h('.cell-value', p.article)),
        p.volumeMl ? h('.cell', h('.cell-body', h('.cell-title', 'Объём')), h('.cell-value', `${p.volumeMl} мл`)) : null,
        p.pieces > 1 ? h('.cell', h('.cell-body', h('.cell-title', 'В комплекте')), h('.cell-value', `${p.pieces} шт.`)) : null,
        h('.cell', h('.cell-body', h('.cell-title', 'Категория')), h('.cell-value', category?.title || '—')),
        h('.cell', h('.cell-body', h('.cell-title', 'Материал')), h('.cell-value', 'Стекло')))),

    section('Доставка и оплата',
      h('.group',
        h('.cell', h('.cell-icon', { html: icon('truck', 18) }),
          h('.cell-body', h('.cell-title', 'Отгрузка за 1–2 дня'), h('.cell-sub', 'После поступления оплаты'))),
        h('.cell', h('.cell-icon', { html: icon('globe', 18) }),
          h('.cell-body', h('.cell-title', 'Москва и СПб — бесплатно'),
            h('.cell-sub', `По России бесплатно от ${money(state.config?.delivery?.freeFrom || 30000)}`))),
        h('.cell', h('.cell-icon', { html: icon('doc', 18) }),
          h('.cell-body', h('.cell-title', 'Работаем с юрлицами'), h('.cell-sub', 'Счёт и закрывающие документы'))))),

    related.length ? h('div',
      h('.row-head', h('h2', 'Похожие'), null),
      productRow(related)) : null,

    h('div', { style: { height: '18px' } }),

    p.outOfStock
      ? h('.bottom-bar', h('button.btn.secondary', { disabled: true }, 'Нет в наличии'),
        tap(h('button.btn.small.ghost', 'Сообщить о поступлении'), () => {
          navigate('support', { prefill: `Сообщите, когда «${p.name}» (арт. ${p.article}) появится в наличии` });
        }))
      : h('.bottom-bar',
        stepper,
        tap(h('button.btn', h('span', 'В корзину'), h('span', { style: { opacity: 0.75 } }, totalLabel)), addAction)),
  );

  return {
    title: p.name,
    content,
    tabbar: false,
    hideTitleUntilScroll: true,
    navRight: favBtn,
    onMount: () => { if (tg.inTelegram) updateTotals(); },
    onDestroy: () => tg.hideMainButton(),
  };
}
