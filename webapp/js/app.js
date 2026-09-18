/** Точка входа витрины: Mini App в Telegram или обычный сайт в браузере. */
import { tg } from './tg.js';
import { h } from './ui.js';
import { bootstrap, state } from './state.js';
import { register, navigate, TABS, updateTabBadges } from './router.js';

import homeView from './views/home.js';
import catalogView from './views/catalog.js';
import productView from './views/product.js';
import cartView from './views/cart.js';
import checkoutView from './views/checkout.js';
import ordersView from './views/orders.js';
import orderView from './views/order.js';
import favoritesView from './views/favorites.js';
import searchView from './views/search.js';
import supportView from './views/support.js';
import profileView from './views/profile.js';

register('home', homeView);
register('catalog', catalogView);
register('product', productView);
register('cart', cartView);
register('checkout', checkoutView);
register('orders', ordersView);
register('order', orderView);
register('favorites', favoritesView);
register('search', searchView);
register('support', supportView);
register('profile', profileView);

function splash(message, retry = false) {
  const host = document.getElementById('screens');
  host.innerHTML = '';
  host.append(h('.screen',
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', gap: '18px', padding: '0 32px', textAlign: 'center' } },
      h('img', { src: 'assets/brand/logo.png', style: { height: '54px', opacity: '0.85' } }),
      retry ? null : h('.spinner'),
      h('.tiny.muted', message),
      retry ? h('button.btn', { style: { width: 'auto', padding: '0 22px' }, onclick: () => location.reload() }, 'Повторить') : null)));
}

async function start() {
  tg.init();
  splash('Загружаем каталог…');

  try {
    await bootstrap();
  } catch (err) {
    console.error(err);
    splash(`Не удалось загрузить магазин: ${err.message}`, true);
    return;
  }

  document.getElementById('screens').innerHTML = '';

  // Глубокие ссылки: t.me/bot?startapp=product_012 | order_<id> | support | cart
  // В браузере те же цели приходят query-параметрами: /?order=… | ?product=…
  const qs = new URLSearchParams(location.search);
  const param = tg.startParam()
    || (qs.get('order') ? `order_${qs.get('order')}` : '')
    || (qs.get('product') ? `product_${qs.get('product')}` : '')
    || '';
  let started = false;
  if (param) {
    const [kind, value] = param.split('_');
    if (kind === 'product' && state.productsById.has(value)) {
      await navigate('home', {}, { replaceStack: true, tab: 'home' });
      await navigate('product', { id: value });
      started = true;
    } else if (kind === 'order' && value) {
      await navigate('profile', {}, { replaceStack: true, tab: 'profile' });
      await navigate('order', { id: value, awaitingPayment: true });
      started = true;
    } else if (kind === 'support') {
      await navigate('home', {}, { replaceStack: true, tab: 'home' });
      await navigate('support');
      started = true;
    } else if (kind === 'cart') {
      await navigate('cart', {}, { replaceStack: true, tab: 'cart' });
      started = true;
    }
  }
  if (!started) await navigate('home', {}, { replaceStack: true, tab: 'home' });

  updateTabBadges();

  // в браузере убираем параметр из адреса, чтобы перезагрузка не открывала тот же экран
  // (в Telegram служебные query-параметры не трогаем)
  if (!tg.inTelegram && (qs.get('order') || qs.get('product'))) {
    history.replaceState(null, '', location.pathname);
  }
}

start();
