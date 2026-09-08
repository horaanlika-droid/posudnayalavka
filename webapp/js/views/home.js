/** Главная: витрина бренда, категории, подборки. */
import { h, tap, section, money } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { state, categoryProducts } from '../state.js';
import { productCard, categoryCard, productRow } from '../components.js';

const SLIDES = [
  { image: 'assets/brand/hero-1.jpg', title: ['Стиль', 'в каждой', 'детали'], accent: 0, sub: 'Стекло, которое делает ваши моменты особенными' },
  { image: 'assets/brand/hero-2.jpg', title: ['Гости приходят', 'в бар', 'за эмоциями'], accent: 1, sub: 'Визуал, тактильность бокала и напиток внутри — работают вместе' },
  { image: 'assets/brand/hero-3.jpg', title: ['Прямые', 'контракты', 'с производством'], accent: 1, sub: 'Отбираем стекло лично на трёх фабриках' },
];

const FEATURES = [
  { icon: 'truck', text: 'Отгрузка\nза 1–2 дня' },
  { icon: 'shield', text: 'Оригинальный\nтовар' },
  { icon: 'diamond', text: 'Отбор\nвручную' },
  { icon: 'card', text: 'Оплата картой\nи по счёту' },
];

function hero() {
  const slides = SLIDES.map((s, i) =>
    h('.hero-slide', { class: i === 0 ? 'active' : '', style: { backgroundImage: `url(${s.image})` } }));
  const dots = SLIDES.map((_, i) => h('.hero-dot', { class: i === 0 ? 'active' : '' }));

  const titleEl = h('.hero-title');
  const subEl = h('.hero-sub');
  const render = (i) => {
    const s = SLIDES[i];
    titleEl.innerHTML = s.title.map((line, idx) => (idx === s.accent ? `<span>${line}</span>` : line)).join('<br>');
    subEl.textContent = s.sub;
  };
  render(0);

  const box = h('.hero',
    h('.hero-slides', ...slides),
    h('.hero-content',
      h('.hero-brand-badge', h('img', { src: 'assets/brand/logo.png', alt: 'Посудная лавка' })),
      titleEl,
      subEl,
      tap(h('button.hero-cta', h('span', 'Перейти в каталог'), h('span', { html: icon('chevron', 16) })),
        () => navigate('catalog')),
      h('.hero-mark')),
    h('.hero-dots', ...dots));

  let index = 0;
  box.timer = setInterval(() => {
    slides[index].classList.remove('active');
    dots[index].classList.remove('active');
    index = (index + 1) % SLIDES.length;
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    render(index);
  }, 5200);
  return box;
}

function brandStrip() {
  return h('.brand-strip',
    h('.brand-strip-logo-wrap', h('img.brand-strip-logo', { src: 'assets/brand/logo.png', alt: 'Посудная лавка' })),
    h('.brand-strip-body',
      h('.brand-strip-chips',
        h('.brand-chip', `${state.products.length} позиций`),
        h('.brand-chip', 'По России и миру')),
      h('.brand-strip-tagline', state.config?.brand?.tagline || 'Барное стекло для впечатлений гостей')),
  );
}

export default function homeView() {
  const hits = state.products.filter((p) => p.isHit).slice(0, 10);
  const news = state.products.filter((p) => p.isNew).slice(0, 10);
  const wine = categoryProducts('wine').slice(0, 10);
  const heroEl = hero();

  const searchBar = tap(h('.searchbar.searchbar-home',
    h('span', { html: icon('search', 17) }),
    h('span', { style: { color: 'var(--label-3)', fontSize: '16px' } }, 'Поиск по каталогу')),
  () => navigate('search'));

  const content = h('div',
    brandStrip(),
    searchBar,
    heroEl,
    h('.features', ...FEATURES.map((f) =>
      h('.feature', h('span', { html: icon(f.icon, 22) }), h('span', { html: f.text.replace('\n', '<br>') })))),

    h('.row-head', h('h2', 'Категории'), tap(h('a', 'Все ', h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
    h('.cat-grid', ...state.categories.slice(0, 6).map((c) => categoryCard(c, categoryProducts(c.id)[0]))),

    hits.length ? h('div',
      h('.row-head', h('h2', 'Популярное'), tap(h('a', 'Все товары ', h('span', { html: icon('chevron', 13) })), () => navigate('catalog'))),
      productRow(hits)) : null,

    news.length ? h('div',
      h('.row-head', h('h2', 'Новинки августа')),
      productRow(news)) : null,

    wine.length ? h('div',
      h('.row-head', h('h2', 'Винная линейка'),
        tap(h('a', 'Смотреть ', h('span', { html: icon('chevron', 13) })), () => navigate('catalog', { category: 'wine' }))),
      productRow(wine)) : null,

    section('О бренде',
      h('.group',
        h('.cell', { style: { display: 'block', padding: '14px' } },
          h('div', { style: { fontSize: '15px', lineHeight: '1.45', color: 'var(--label-2)' } },
            '«Посудная лавка» появилась из понимания, что в барной индустрии не бывает мелочей. ',
            'Каждый бокал — продолжение напитка и часть впечатления гостя. Мы лично отбираем стекло ',
            'по прямым контрактам на трёх производствах.')))),

    section('Доставка',
      h('.group',
        h('.cell', { style: { display: 'block', padding: '14px' } },
          h('div', { style: { fontSize: '15px', lineHeight: '1.45', color: 'var(--label-2)' } },
            state.config?.delivery?.note || '')))),

    h('.brand-footer',
      h('img', { src: 'assets/brand/logo.png', alt: 'Посудная лавка' }),
      h('p.brand-footer-title', state.config?.brand?.title || 'Посудная лавка'),
      h('p', `${state.products.length} позиций в каталоге · цены августа 2026`),
      h('p', state.config?.brand?.email || '')),
  );

  return {
    title: 'Посудная лавка',
    content,
    tab: 'home',
    hideTitleUntilScroll: true,
    navRight: tap(h('button.nav-btn.icon', { html: icon('chat', 22) }), () => navigate('support')),
    onDestroy: () => clearInterval(heroEl.timer),
  };
}
