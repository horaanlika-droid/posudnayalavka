/** Кабинет: профиль, заказы, поддержка, информация о бренде. */
import { h, tap, section, cell, group, money, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { tg } from '../tg.js';
import { state, favoriteProducts, cartCount } from '../state.js';
import { api } from '../api.js';

function infoSheet(title, bodyNodes) {
  sheet({ title, body: h('div', { style: { padding: '0 16px 8px' } }, ...bodyNodes) });
}

export default function profileView() {
  const user = state.config?.user || {};
  const brand = state.config?.brand || {};
  const initials = (user.firstName || 'Г').slice(0, 1).toUpperCase();

  const ordersCountEl = h('b', String(user.ordersCount || 0));
  const spentEl = h('b', money(user.totalSpent || 0));

  api.orders().then((res) => {
    ordersCountEl.textContent = String(res.orders.length);
    const paid = res.orders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0);
    spentEl.textContent = money(paid);
  }).catch(() => {});

  const content = h('div',
    h('.profile-head',
      h('.avatar', user.photoUrl ? h('img', { src: user.photoUrl, alt: '' }) : initials),
      h('div',
        h('.profile-name', [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Гость'),
        h('.profile-sub', user.username ? `@${user.username}` : 'Добро пожаловать в «Посудную лавку»'))),

    h('.stat-grid',
      h('.stat', ordersCountEl, h('span', 'заказов')),
      h('.stat', spentEl, h('span', 'на сумму')),
      h('.stat', h('b', String(favoriteProducts().length)), h('span', 'в избранном'))),

    section('Покупки', group(
      cell({ title: 'Мои заказы', iconName: 'box', chevron: true, onClick: () => navigate('orders') }),
      cell({ title: 'Избранное', iconName: 'heart', chevron: true, value: String(favoriteProducts().length), onClick: () => navigate('favorites', {}, { replaceStack: true, tab: 'favorites' }) }),
      cell({ title: 'Корзина', iconName: 'bag', chevron: true, value: cartCount() ? String(cartCount()) : '', onClick: () => navigate('cart', {}, { replaceStack: true, tab: 'cart' }) }),
    )),

    section('Помощь', group(
      cell({ title: 'Чат с менеджером', sub: 'Ответим в рабочее время', iconName: 'chat', chevron: true, onClick: () => navigate('support') }),
      cell({
        title: 'Доставка и оплата', iconName: 'truck', chevron: true,
        onClick: () => infoSheet('Доставка и оплата', [
          h('p.muted', { style: { fontSize: '15px', lineHeight: '1.5' } }, state.config?.delivery?.note || ''),
          group(
            cell({ title: 'Москва и Санкт-Петербург', value: 'бесплатно' }),
            cell({ title: 'По России', value: `от ${money(state.config?.delivery?.freeFrom || 30000)} бесплатно` }),
            cell({ title: 'Мир', value: 'индивидуально' }),
          ),
          h('div', { style: { height: '14px' } }),
          group(
            cell({ title: 'Картой онлайн', sub: 'ЮKassa: Visa, Mastercard, МИР, СБП', iconName: 'card' }),
            cell({ title: 'Счёт для юрлица', sub: 'Оплата по реквизитам, закрывающие документы', iconName: 'doc' }),
          ),
        ]),
      }),
      cell({
        title: 'О бренде', iconName: 'info', chevron: true,
        onClick: () => infoSheet('О бренде', [
          h('p.muted', { style: { fontSize: '15px', lineHeight: '1.5' } },
            '«Посудная лавка» появилась из понимания, что в барной индустрии не бывает мелочей. Каждый бокал — ' +
            'продолжение напитка и часть впечатления гостя. Мы лично отбираем стекло по прямым контрактам ' +
            'на трёх производствах в Китае, чтобы предложить барам и ресторанам посуду, сочетающую эстетику и функциональность.'),
          h('p.muted', { style: { fontSize: '15px', lineHeight: '1.5' } },
            'Роман Сабанаев, сооснователь. В индустрии гостеприимства 16 лет, более 20 проектов с нуля, ' +
            'основатель «Pop-up Bar», в прошлом бренд-бар-менеджер El Copitas Bar, Tagliatella Caffe, Paloma Cantina, Sangre Fresca и Nola Jazz Bar.'),
          group(...(brand.managers || []).map((m) =>
            cell({
              title: m.region, sub: `${m.phone} · @${m.telegram}`, iconName: 'phone', chevron: true,
              onClick: () => tg.openTelegramLink(`https://t.me/${m.telegram}`),
            }))),
        ]),
      }),
      cell({
        title: 'Контакты', iconName: 'phone', chevron: true,
        onClick: () => infoSheet('Контакты', [
          group(
            cell({ title: 'Telegram-канал', sub: `@${brand.telegram || ''}`, iconName: 'chat', chevron: true, onClick: () => tg.openTelegramLink(`https://t.me/${brand.telegram}`) }),
            cell({ title: 'Instagram', sub: `@${brand.instagram || ''}`, iconName: 'globe', chevron: true, onClick: () => tg.openLink(`https://instagram.com/${brand.instagram}`) }),
            cell({ title: 'Почта', sub: brand.email || '', iconName: 'info' }),
          ),
        ]),
      }),
    )),

    section('Каталог', group(
      cell({ title: 'Все товары', sub: `${state.products.length} позиций`, iconName: 'grid', chevron: true, onClick: () => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' }) }),
      cell({ title: 'Новинки', iconName: 'star', chevron: true, onClick: () => navigate('catalog', { category: 'all' }) }),
    )),

    state.config?.devMode
      ? h('.notice.warn', 'Режим предпросмотра: вход без Telegram. На проде задайте BOT_TOKEN и уберите ALLOW_DEV_AUTH.')
      : null,

    h('.brand-footer',
      h('img', { src: 'assets/brand/logo.png', alt: '' }),
      h('p', 'Прайс август 2026 · цены указаны за штуку'),
      h('p', brand.email || '')),
  );

  return { title: 'Кабинет', tab: 'profile', content };
}
