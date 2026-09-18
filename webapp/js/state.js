/** Глобальное состояние витрины: каталог, корзина, избранное, черновик заказа. */
import { api } from './api.js';

const LS_CART = 'pl.cart.v1';
const LS_DRAFT = 'pl.checkout.v1';

const listeners = new Set();

export const state = {
  ready: false,
  config: null,
  categories: [],
  products: [],
  productsById: new Map(),
  favorites: new Set(),
  cart: new Map(), // id -> qty
  orders: [],
  supportUnread: 0,
  draft: {
    customer: { name: '', phone: '', email: '' },
    delivery: { method: 'cdek', city: '', address: '' },
    company: { name: '', inn: '', kpp: '', address: '', email: '' },
    comment: '',
    payment: null,
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(event = 'change') {
  for (const fn of listeners) {
    try { fn(event, state); } catch (err) { console.error(err); }
  }
}

// ── загрузка ──────────────────────────────────────────────────
function loadLocal() {
  try {
    const cart = JSON.parse(localStorage.getItem(LS_CART) || '[]');
    for (const it of cart) state.cart.set(String(it.id), Number(it.qty) || 1);
  } catch {}
  try {
    const draft = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
    if (draft) Object.assign(state.draft, draft);
  } catch {}
}

function persistLocal() {
  localStorage.setItem(LS_CART, JSON.stringify(cartItems()));
  localStorage.setItem(LS_DRAFT, JSON.stringify(state.draft));
}

export async function bootstrap() {
  loadLocal();
  const [config, catalog] = await Promise.all([api.config(), api.catalog()]);
  state.config = config;
  state.categories = catalog.categories;
  state.products = catalog.products;
  state.productsById = new Map(catalog.products.map((p) => [p.id, p]));
  state.ready = true;

  // подтягиваем избранное и серверную корзину (если пользователь заходил с другого устройства)
  try {
    const [fav, cart] = await Promise.all([api.favorites(), api.cart()]);
    state.favorites = new Set(fav.ids || []);
    if (!state.cart.size && cart.items?.length) {
      for (const it of cart.items) state.cart.set(String(it.id), it.qty);
    }
  } catch (err) {
    console.warn('[state] синхронизация не удалась', err.message);
  }

  // чистим корзину от исчезнувших товаров
  for (const id of [...state.cart.keys()]) {
    const p = state.productsById.get(id);
    if (!p || p.outOfStock) state.cart.delete(id);
  }

  persistLocal();
  notify('ready');
  return state;
}

// ── каталог ───────────────────────────────────────────────────
export const product = (id) => state.productsById.get(String(id)) || null;

export function categoryProducts(categoryId) {
  return state.products.filter((p) => p.category === categoryId);
}

export function categoryCount(categoryId) {
  return categoryProducts(categoryId).length;
}

export function searchProducts(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.products;
  return state.products.filter((p) =>
    `${p.name} ${p.article} ${p.volumeLabel}`.toLowerCase().includes(q));
}

// ── корзина ───────────────────────────────────────────────────
export function cartItems() {
  return [...state.cart.entries()].map(([id, qty]) => ({ id, qty }));
}

export function cartDetailed() {
  return cartItems()
    .map(({ id, qty }) => {
      const p = product(id);
      return p ? { ...p, qty, sum: p.price * qty } : null;
    })
    .filter(Boolean);
}

export const cartCount = () => [...state.cart.values()].reduce((s, q) => s + q, 0);
export const cartSubtotal = () => cartDetailed().reduce((s, it) => s + it.sum, 0);

function syncCart() {
  persistLocal();
  api.saveCart(cartItems()).catch(() => {});
  notify('cart');
}

export function addToCart(id, qty = 1) {
  const key = String(id);
  state.cart.set(key, Math.min(999, (state.cart.get(key) || 0) + qty));
  syncCart();
}

export function setQty(id, qty) {
  const key = String(id);
  if (qty <= 0) state.cart.delete(key);
  else state.cart.set(key, Math.min(999, qty));
  syncCart();
}

export function removeFromCart(id) {
  state.cart.delete(String(id));
  syncCart();
}

export function clearCart() {
  state.cart.clear();
  syncCart();
}

export const inCart = (id) => state.cart.get(String(id)) || 0;

// ── избранное ─────────────────────────────────────────────────
export const isFavorite = (id) => state.favorites.has(String(id));

export function toggleFavorite(id) {
  const key = String(id);
  if (state.favorites.has(key)) state.favorites.delete(key);
  else state.favorites.add(key);
  notify('favorites');
  api.toggleFavorite(key)
    .then((res) => { state.favorites = new Set(res.ids || []); notify('favorites'); })
    .catch(() => {});
  return state.favorites.has(key);
}

export const favoriteProducts = () => state.products.filter((p) => state.favorites.has(p.id));

// ── доставка и черновик ───────────────────────────────────────
export function shippingFor(subtotal, method) {
  const cfg = state.config?.delivery;
  if (!cfg) return 0;
  const m = cfg.methods?.find((x) => x.id === method);
  if (!m || m.free) return 0;
  return subtotal >= cfg.freeFrom ? 0 : cfg.cost;
}

export function saveDraft(patch) {
  Object.assign(state.draft, patch);
  persistLocal();
}

export function updateOrdersCache(orders) {
  state.orders = orders;
  notify('orders');
}
