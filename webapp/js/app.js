/** Точка входа Mini App. */
import { tg } from './tg.js';
import { h, toast } from './ui.js';
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
  const param = tg.startParam();
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

  if (state.config?.devMode && !tg.inTelegram) {
    setTimeout(() => toast('Предпросмотр в браузере: часть функций Telegram недоступна', 3200), 900);
  }
}

start();
