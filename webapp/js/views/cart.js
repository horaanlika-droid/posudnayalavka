/** Корзина. */
import { h, tap, money, section, emptyState, plural, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, refresh } from '../router.js';
import { tg } from '../tg.js';
import {
  cartDetailed, cartSubtotal, setQty, removeFromCart, clearCart, state, shippingFor,
} from '../state.js';
import { productRow } from '../components.js';

export default function cartView() {
  const items = cartDetailed();

  if (!items.length) {
    const recommended = state.products.filter((p) => p.isHit).slice(0, 10);
    return {
      title: 'Корзина',
      tab: 'cart',
      content: h('div',
        emptyState({
          emoji: '🛒',
          title: 'Корзина пуста',
          text: 'Загляните в каталог — там 75 позиций барного стекла',
          action: tap(h('button.btn', { style: { width: 'auto', padding: '0 22px', marginTop: '8px' } }, 'В каталог'),
            () => navigate('catalog')),
        }),
        recommended.length ? h('div', h('.row-head', h('h2', 'Популярное')), productRow(recommended)) : null),
    };
  }

  const subtotal = cartSubtotal();
  const method = state.draft.delivery.method;
  const shipping = shippingFor(subtotal, method);
  const total = subtotal + shipping;
  const freeFrom = state.config?.delivery?.freeFrom || 30000;
  const left = Math.max(0, freeFrom - subtotal);

  const rows = items.map((it) => {
    const sumLabel = h('span.cart-price', money(it.sum));
    const qtyLabel = h('span.qty', String(it.qty));
    const row = h('.cart-item',
      h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '', loading: 'lazy' }) : null),
      h('.cart-body',
        h('.cart-name', it.name),
        h('.cart-sub', `${it.volumeLabel || ''} · арт. ${it.article}`),
        h('.cart-row',
          h('.stepper',
            tap(h('button', { html: icon('minus', 16) }), async () => {
              const next = it.qty - 1;
              if (next <= 0) {
                const ok = await confirmDialog({ title: 'Убрать товар?', message: it.name, okText: 'Убрать', destructive: true });
                if (!ok) return;
                removeFromCart(it.id);
                refresh();
                return;
              }
              it.qty = next;
              setQty(it.id, next);
              qtyLabel.textContent = String(next);
              sumLabel.textContent = money(it.price * next);
              refresh();
            }),
            qtyLabel,
            tap(h('button', { html: icon('plus', 16) }), () => {
              it.qty += 1;
              setQty(it.id, it.qty);
              qtyLabel.textContent = String(it.qty);
              sumLabel.textContent = money(it.price * it.qty);
              refresh();
            })),
          sumLabel)),
    );
    return row;
  });

  const checkout = () => navigate('checkout');

  const content = h('div',
    left > 0
      ? h('.notice', `До бесплатной доставки по России осталось ${money(left)}. По Москве и Санкт-Петербургу доставка всегда бесплатная.`)
      : h('.notice', 'Доставка по России бесплатная — сумма заказа больше порога 🎉'),

    section(`${items.length} ${plural(items.length, ['товар', 'товара', 'товаров'])}`, h('.group', ...rows)),

    section('Итого',
      h('.group',
        h('.summary-row', h('span', 'Товары'), h('span.mono', money(subtotal))),
        h('.summary-row', h('span', 'Доставка'),
          shipping ? h('span.mono', money(shipping)) : h('span.free', 'бесплатно')),
        h('.summary-row.total', h('span', 'К оплате'), h('span.mono', money(total))))),

    h('div', { style: { padding: '18px 16px 6px' } },
      tap(h('button.btn', `Оформить заказ · ${money(total)}`), checkout)),

    h('div', { style: { padding: '0 16px 12px' } },
      tap(h('button.btn.danger', 'Очистить корзину'), async () => {
        const ok = await confirmDialog({ title: 'Очистить корзину?', message: 'Все товары будут удалены', okText: 'Очистить', destructive: true });
        if (ok) { clearCart(); refresh(); }
      })),
  );

  return {
    title: 'Корзина',
    tab: 'cart',
    content,
    onMount: () => {
      if (tg.inTelegram) {
        tg.mainButton({ text: `Оформить заказ · ${money(total)}`, onClick: checkout });
      }
    },
    onDestroy: () => tg.hideMainButton(),
  };
}
