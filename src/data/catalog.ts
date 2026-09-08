import type { Category, Product } from "@/lib/types";

// ============================================================================
//  CATALOG — POSUDNAYA LAVKA (стеклянная/керамическая посуда)
//  ⚠️ ЗАМЕНИ содержимое на актуальный каталог, когда пришлёшь файл.
//  Правила:
//   • priceMinor — цена в копейках (RUB). Т.е. 1990 = 19,90 ₽. Цены берутся
//     строго отсюда — приложение не хранит цены где-то ещё.
//   • Для бокалов с одним размером используй priceMinor.
//   • Для нескольких объёмов/наборов — variants (id, label, priceMinor).
//   • image — абсолютный URL или путь /img/... (положи файл в public/img).
//     Можно оставить пустым — тогда на карточке будет красивая заглушка.
// ============================================================================

export const CATEGORIES: Category[] = [
  { id: "all", title: "Всё", emoji: "✨" },
  { id: "wine", title: "Вино", emoji: "🍷" },
  { id: "champagne", title: "Шампанское", emoji: "🥂" },
  { id: "spirits", title: "Крепкий алкоголь", emoji: "🥃" },
  { id: "cocktail", title: "Коктейль", emoji: "🍸" },
  { id: "beer", title: "Пиво", emoji: "🍺" },
  { id: "tasting", title: "Дегустационные", emoji: "🥄" },
];

export const PRODUCTS: Product[] = [
  {
    id: "wine-red-standard",
    category: "wine",
    title: "Бокал для красного вина",
    subtitle: "Тюльпан, ножка",
    measure: "560 мл · h 24 см",
    description:
      "Классический бокал для красных вин. Широкое «брюхо» раскрывает аромат, ножка удобно лежит в руке. Ударопрочное стекло, можно мыть в посудомойке.",
    priceMinor: 5900,
    featured: true,
  },
  {
    id: "wine-white-standard",
    category: "wine",
    title: "Бокал для белого вина",
    subtitle: "Тюльпан, ножка",
    measure: "390 мл · h 23 см",
    description:
      "Чуть уже корпуса красных вин, чтобы сохранить свежесть и температуру белого вина. Прозрачное тонкое стекло, без бликов.",
    priceMinor: 5900,
  },
  {
    id: "champagne-flute",
    category: "champagne",
    title: "Фужер для шампанского",
    subtitle: "Флейта",
    measure: "240 мл · h 25 см",
    description:
      "Узкая высокая флейта бережно сохраняет пузырьки и подчёркивает игру света в игристом. Подходит для шампанского и просекко.",
    priceMinor: 6400,
    featured: true,
  },
  {
    id: "champagne-coupe",
    category: "champagne",
    title: "Купе для шампанского",
    subtitle: "Широкая чаша на ножке",
    measure: "200 мл · h 16 см",
    description:
      "Ретро-купе в духе 20-х. Идеально для коктейлей и десертных игристых, красиво смотрится в кадре.",
    priceMinor: 7200,
  },
  {
    id: "spirits-whisky",
    category: "spirits",
    title: "Стакан для виски",
    subtitle: "Old fashioned, дно 2.5 см",
    measure: "350 мл · h 9 см",
    description:
      "Тяжёлый стакан с толстым дном — настоящий old fashioned. Хорошо держит кубик льда, не звенит на столе.",
    priceMinor: 8900,
    variants: [
      { id: "single", label: "1 шт", priceMinor: 8900 },
      { id: "pair", label: "Набор 2 шт", priceMinor: 16900 },
      { id: "set4", label: "Набор 4 шт", priceMinor: 32900 },
    ],
    featured: true,
  },
  {
    id: "spirits-cognac",
    category: "spirits",
    title: "Снифтер для коньяка",
    subtitle: "Тюльпан на ножке",
    measure: "250 мл · h 17 см",
    description:
      "Классический снифтер. Широкая чаша согревает напиток ладонью, аромат собирается у узкого горлышка.",
    priceMinor: 9800,
  },
  {
    id: "cocktail-martini",
    category: "cocktail",
    title: "Бокал Мартини",
    subtitle: "На ножке, «V»",
    measure: "180 мл · h 21 см",
    description:
      "Элегантный бокал на ножке для мартини и коктейлей «вверх». Тонкая кромка — приятный глоток.",
    priceMinor: 7700,
  },
  {
    id: "cocktail-highball",
    category: "cocktail",
    title: "Хайбол",
    subtitle: "Прямой высокий",
    measure: "350 мл · h 15 см",
    description:
      "Универсальный стакан для длинных коктейлей: мохито, джин-тоник, апероль. Много льда помещается.",
    priceMinor: 6900,
  },
  {
    id: "beer-pilsner",
    category: "beer",
    title: "Бокал Пильснер",
    subtitle: "Вытянутый, на ножке",
    measure: "500 мл · h 25 см",
    description:
      "Узкий книзу бокал для светлого пива. Подчёркивает цвет и держит плотную шапку пены.",
    priceMinor: 7500,
  },
  {
    id: "tasting-shot",
    category: "tasting",
    title: "Дегустационный набор",
    subtitle: "50 мл × 6 шт",
    measure: "6 × 50 мл · h 8 см",
    description:
      "Набор маленьких стаканчиков для дегустации и шотов. Можно мыть в посудомоечной машине.",
    priceMinor: 14900,
  },
];
