/**
 * Навигация: стек экранов с iOS-переходами, навбар и таб-бар.
 */
import { h, tap } from './ui.js';
import { icon } from './icons.js';
import { tg } from './tg.js';
import { state, subscribe, cartCount } from './state.js';

const routes = new Map();
const stack = [];

const screensEl = () => document.getElementById('screens');
const navbarEl = () => document.getElementById('navbar');
const tabbarEl = () => document.getElementById('tabbar');

export const TABS = [
  { id: 'home', title: 'Главная', icon: 'home', route: 'home' },
  { id: 'catalog', title: 'Каталог', icon: 'grid', route: 'catalog' },
  { id: 'favorites', title: 'Избранное', icon: 'heart', route: 'favorites' },
  { id: 'cart', title: 'Корзина', icon: 'bag', route: 'cart' },
  { id: 'profile', title: 'Кабинет', icon: 'person', route: 'profile' },
];

export function register(name, view) {
  routes.set(name, view);
}

export function current() {
  return stack[stack.length - 1] || null;
}

/**
 * view(params, ctx) -> { title, content, tabbar, transparentNav, navRight, navLeft, onMount, onDestroy, largeTitle }
 */
async function build(name, params) {
  const view = routes.get(name);
  if (!view) throw new Error(`Экран «${name}» не найден`);
  const screen = h('.screen');
  const ctx = { screen, params, refresh: () => refresh() };
  const result = (await view(params, ctx)) || {};
  if (result.content) screen.append(result.content);
  if (result.classes) screen.classList.add(...result.classes);
  if (result.tabbar === false) screen.classList.add('no-tabbar');
  return { name, params, screen, ...result, ctx };
}

function applyChrome(entry) {
  const nav = navbarEl();
  nav.innerHTML = '';
  nav.classList.toggle('transparent', Boolean(entry.transparentNav));
  nav.classList.remove('scrolled');

  const canGoBack = stack.length > 1;
  const left = h('.nav-side');
  if (entry.navLeft) left.append(entry.navLeft);
  else if (canGoBack) {
    left.append(tap(h('button.nav-btn', { html: `${icon('chevronLeft', 22)}<span>Назад</span>` }), () => back(), 'light'));
  } else if (entry.navLogo !== false) {
    left.append(h('img.nav-logo', { src: 'assets/brand/logo.png', alt: 'Посудная лавка' }));
  }

  const title = h('.nav-title', entry.title || '');
  if (entry.hideTitleUntilScroll) title.classList.add('hidden');

  const right = h('.nav-side.right');
  if (entry.navRight) right.append(entry.navRight);

  nav.append(left, title, right);

  // тень навбара + появление заголовка при скролле
  entry.screen.onscroll = () => {
    const y = entry.screen.scrollTop;
    nav.classList.toggle('scrolled', y > 6);
    if (entry.hideTitleUntilScroll) title.classList.toggle('hidden', y < 40);
    entry.onScroll?.(y);
  };

  // системная кнопка «назад» Telegram
  tg.backButton(canGoBack, () => back());

  renderTabbar(entry);
}

function renderTabbar(entry) {
  const bar = tabbarEl();
  const hidden = entry.tabbar === false;
  bar.classList.toggle('hidden', hidden);
  if (hidden) return;

  const activeTab = entry.tab || stack[0]?.tab || 'home';
  bar.innerHTML = '';
  for (const tab of TABS) {
    const badgeCount = tab.id === 'cart' ? cartCount() : 0;
    const el = h('button.tab', { class: tab.id === activeTab ? 'active' : '' },
      h('span', { html: icon(tab.icon, 26) }),
      h('span', tab.title),
      badgeCount ? h('.tab-badge', badgeCount > 99 ? '99+' : String(badgeCount)) : null,
    );
    tap(el, () => switchTab(tab), 'select');
    bar.append(el);
  }
}

function mount(entry, animation) {
  const host = screensEl();
  host.append(entry.screen);
  if (animation) entry.screen.classList.add(animation);
  applyChrome(entry);
  entry.onMount?.(entry.screen);
}

function unmount(entry, animation) {
  if (!entry) return;
  entry.onDestroy?.();
  const el = entry.screen;
  if (animation) {
    el.classList.add(animation);
    setTimeout(() => el.remove(), 340);
  } else el.remove();
}

export async function navigate(name, params = {}, options = {}) {
  const previous = current();
  const entry = await build(name, params);
  entry.tab = options.tab || (TABS.find((t) => t.route === name)?.id) || previous?.tab || 'home';

  if (options.replaceStack) {
    for (const item of stack) unmount(item);
    stack.length = 0;
    stack.push(entry);
    mount(entry, 'fade-in');
    return entry;
  }

  stack.push(entry);
  mount(entry, 'enter-push');
  if (previous) {
    previous.screen.classList.add('exit-push');
    setTimeout(() => {
      previous.screen.style.display = 'none';
      previous.screen.classList.remove('exit-push');
    }, 340);
  }
  return entry;
}

export function back() {
  if (stack.length < 2) {
    if (tg.inTelegram) tg.close();
    return;
  }
  const top = stack.pop();
  const prev = current();
  prev.screen.style.display = '';
  prev.screen.classList.add('enter-pop');
  setTimeout(() => prev.screen.classList.remove('enter-pop'), 340);
  applyChrome(prev);
  prev.onReturn?.();
  unmount(top, 'exit-pop');
}

export async function switchTab(tab) {
  const top = current();
  if (top?.tab === tab.id && stack.length === 1) {
    top.screen.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  await navigate(tab.route, {}, { replaceStack: true, tab: tab.id });
}

/** Полная перерисовка текущего экрана (после изменения данных). */
export async function refresh() {
  const top = current();
  if (!top) return;
  const scrollY = top.screen.scrollTop;
  const rebuilt = await build(top.name, top.params);
  rebuilt.tab = top.tab;
  stack[stack.length - 1] = rebuilt;
  top.screen.replaceWith(rebuilt.screen);
  top.onDestroy?.();
  applyChrome(rebuilt);
  rebuilt.onMount?.(rebuilt.screen);
  rebuilt.screen.scrollTop = scrollY;
}

export function updateTabBadges() {
  const top = current();
  if (top) renderTabbar(top);
}

subscribe((event) => {
  if (event === 'cart') updateTabBadges();
});
