/**
 * Счёт для юридических лиц: номер, суммы, HTML-версия для печати/сохранения в PDF.
 * Реквизиты продавца подставляются из переменных окружения (SELLER_*).
 */
import { config } from '../config.js';
import { db, save } from '../store.js';

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function nextInvoiceNumber() {
  db.counters.invoice = (db.counters.invoice || 0) + 1;
  save();
  const year = new Date().getFullYear();
  return `${config.seller.invoicePrefix}${year}-${String(db.counters.invoice).padStart(4, '0')}`;
}

export function formatDateRu(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

const money = (v) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function vatInfo(total) {
  const mode = config.seller.vat;
  if (mode === '20') return { label: 'В том числе НДС 20%', value: money((total / 120) * 20) };
  if (mode === '10') return { label: 'В том числе НДС 10%', value: money((total / 110) * 10) };
  return { label: 'НДС', value: 'не облагается' };
}

/** Сумма прописью (рубли и копейки). */
export function amountInWords(amount) {
  const rub = Math.floor(amount);
  const kop = Math.round((amount - rub) * 100);
  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const onesF = [...ones];
  onesF[1] = 'одна';
  onesF[2] = 'две';
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  const triple = (n, female) => {
    const list = female ? onesF : ones;
    const out = [];
    if (n >= 100) out.push(hundreds[Math.floor(n / 100)]);
    const rest = n % 100;
    if (rest >= 20) {
      out.push(tens[Math.floor(rest / 10)]);
      if (rest % 10) out.push(list[rest % 10]);
    } else if (rest) out.push(list[rest]);
    return out.filter(Boolean).join(' ');
  };
  const plural = (n, forms) => {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  };

  const parts = [];
  const millions = Math.floor(rub / 1_000_000);
  const thousands = Math.floor((rub % 1_000_000) / 1000);
  const units = rub % 1000;
  if (millions) parts.push(triple(millions, false), plural(millions, ['миллион', 'миллиона', 'миллионов']));
  if (thousands) parts.push(triple(thousands, true), plural(thousands, ['тысяча', 'тысячи', 'тысяч']));
  if (units || !rub) parts.push(triple(units, false));
  const words = parts.filter(Boolean).join(' ').trim() || 'ноль';
  const rubWord = plural(rub, ['рубль', 'рубля', 'рублей']);
  const kopWord = plural(kop, ['копейка', 'копейки', 'копеек']);
  const text = `${words} ${rubWord} ${String(kop).padStart(2, '0')} ${kopWord}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** HTML-версия счёта (A4, печатается в PDF средствами браузера). */
export function renderInvoiceHtml(order) {
  const s = config.seller;
  const c = order.company || {};
  const vat = vatInfo(order.total);
  const rows = order.items
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.name)} · арт. ${esc(it.article)}${it.volumeLabel ? `, ${esc(it.volumeLabel)}` : ''}</td>
        <td class="c">шт.</td>
        <td class="r">${it.qty}</td>
        <td class="r">${money(it.price)}</td>
        <td class="r">${money(it.price * it.qty)}</td>
      </tr>`,
    )
    .join('');
  const shippingRow = order.shipping
    ? `<tr>
        <td class="c">${order.items.length + 1}</td>
        <td>Доставка</td><td class="c">усл.</td><td class="r">1</td>
        <td class="r">${money(order.shipping)}</td><td class="r">${money(order.shipping)}</td>
      </tr>`
    : '';

  const req = (label, value) => `<tr><td class="lbl">${label}</td><td class="val">${esc(value) || '—'}</td></tr>`;

  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Счёт ${esc(order.invoiceNumber)} · Посудная лавка</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.45 "Helvetica Neue", Arial, sans-serif; color: #111; background: #f4f4f5; margin: 0; padding: 24px 12px 60px; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px 44px; box-shadow: 0 10px 40px rgba(0,0,0,.09); border-radius: 6px; }
  h1 { font-size: 21px; margin: 26px 0 4px; }
  .muted { color: #666; }
  table { width: 100%; border-collapse: collapse; }
  .req td { border: 1px solid #333; padding: 5px 8px; vertical-align: top; }
  .req .lbl { width: 38%; background: #fafafa; }
  .items { margin-top: 14px; }
  .items th, .items td { border: 1px solid #333; padding: 6px 8px; }
  .items th { background: #f2f2f2; font-weight: 600; font-size: 12px; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; text-align: right; font-size: 14px; }
  .totals b { font-size: 16px; }
  .sign { margin-top: 46px; display: flex; gap: 60px; }
  .sign div { flex: 1; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; }
  .note { margin-top: 26px; padding: 12px 14px; background: #fbf4ee; border-left: 3px solid #e08a4d; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .brand { font-size: 17px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .actions { max-width: 820px; margin: 0 auto 14px; display: flex; gap: 10px; }
  .actions button { flex: 1; padding: 13px; font-size: 15px; font-weight: 600; border: 0; border-radius: 12px; background: #e08a4d; color: #fff; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; padding: 0; } .actions { display: none; } }
</style></head>
<body>
<div class="actions"><button onclick="window.print()">Печать / сохранить PDF</button></div>
<div class="sheet">
  <div class="head">
    <div>
      <div class="brand">Posudnaya Lavka</div>
      <div class="muted">Барное стекло для ресторанов и баров</div>
    </div>
    <div class="muted r">
      ${esc(s.phone)}<br>${esc(s.email)}
    </div>
  </div>

  <table class="req" style="margin-top:22px">
    ${req('Банк получателя', s.bankName)}
    ${req('БИК', s.bik)}
    ${req('Корр. счёт', s.corrAccount)}
    ${req('Расчётный счёт', s.account)}
    ${req('ИНН / КПП получателя', [s.inn, s.kpp].filter(Boolean).join(' / '))}
    ${req('Получатель', s.legalName || s.name)}
    ${s.address ? req('Адрес', s.address) : ''}
  </table>

  <h1>Счёт на оплату № ${esc(order.invoiceNumber)} от ${formatDateRu(order.createdAt)}</h1>

  <table class="req" style="margin-top:14px">
    ${req('Поставщик', [s.legalName || s.name, s.inn ? `ИНН ${s.inn}` : '', s.kpp ? `КПП ${s.kpp}` : '', s.address].filter(Boolean).join(', '))}
    ${req('Покупатель', [c.name, c.inn ? `ИНН ${c.inn}` : '', c.kpp ? `КПП ${c.kpp}` : '', c.address].filter(Boolean).join(', '))}
    ${req('Основание', `Заказ ${order.number} от ${formatDateRu(order.createdAt)}`)}
  </table>

  <table class="items">
    <thead><tr><th style="width:36px">№</th><th>Товар</th><th style="width:52px">Ед.</th><th style="width:60px">Кол-во</th><th style="width:100px">Цена</th><th style="width:110px">Сумма</th></tr></thead>
    <tbody>${rows}${shippingRow}</tbody>
  </table>

  <div class="totals">
    Итого: <b>${money(order.total)} ₽</b><br>
    <span class="muted">${vat.label}: ${vat.value}${config.seller.vat === 'none' ? '' : ' ₽'}</span>
  </div>

  <p style="margin-top:16px">
    Всего наименований ${order.items.length}, на сумму <b>${money(order.total)} ₽</b><br>
    <b>${amountInWords(order.total)}</b>
  </p>

  <div class="note">
    Оплата этого счёта означает согласие с условиями поставки. Отгрузка — в течение 1–2 рабочих дней
    после поступления средств. В назначении платежа укажите: «Оплата по счёту № ${esc(order.invoiceNumber)}».
  </div>

  <div class="sign">
    <div>Руководитель${s.signer ? ` — ${esc(s.signer)}` : ''}</div>
    <div>Бухгалтер${s.signer ? ` — ${esc(s.signer)}` : ''}</div>
  </div>
</div>
</body></html>`;
}

/** Краткая сводка по счёту для API/бота. */
export function invoiceSummary(order) {
  return {
    number: order.invoiceNumber,
    total: order.total,
    inWords: amountInWords(order.total),
    seller: {
      legalName: config.seller.legalName || config.seller.name,
      inn: config.seller.inn,
      kpp: config.seller.kpp,
      account: config.seller.account,
      bankName: config.seller.bankName,
      bik: config.seller.bik,
      corrAccount: config.seller.corrAccount,
      configured: config.seller.configured,
    },
    url: `${config.publicUrl || ''}/invoice/${order.id}?k=${order.invoiceKey}`,
  };
}
