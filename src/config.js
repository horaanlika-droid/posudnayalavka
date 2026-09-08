/**
 * Конфигурация приложения. Всё берётся из переменных окружения —
 * ни токенов, ни ключей, ни ID администраторов в коде нет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Простейший .env-лоадер (без зависимостей). На BotHost переменные задаются
// в панели, локально — файлом .env рядом с проектом.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const str = (k, def = '') => (process.env[k] ?? def).toString().trim();
const num = (k, def) => {
  const v = Number.parseFloat(str(k));
  return Number.isFinite(v) ? v : def;
};
const bool = (k, def = false) => {
  const v = str(k).toLowerCase();
  if (!v) return def;
  return ['1', 'true', 'yes', 'on', 'da'].includes(v);
};

const botToken = str('BOT_TOKEN');
const adminIds = str('ADMIN_IDS')
  .split(/[,;\s]+/)
  .map((x) => x.trim())
  .filter(Boolean)
  .map(Number)
  .filter((x) => Number.isFinite(x) && x > 0);

const publicUrl = str('PUBLIC_URL').replace(/\/+$/, '');

export const config = {
  root: ROOT,
  mode: (str('MODE', 'all') || 'all').toLowerCase(), // all | web | bot
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  publicUrl,

  telegram: {
    token: botToken,
    hasBot: Boolean(botToken),
    username: str('BOT_USERNAME').replace(/^@/, ''),
    adminIds,
    mode: str('TELEGRAM_MODE', 'polling').toLowerCase(),
    webhookSecret: str('TELEGRAM_WEBHOOK_SECRET'),
  },

  // Вход без Telegram: явным флагом или автоматически, если бот не настроен
  // (нужно, чтобы приложение открывалось в обычном браузере при разработке).
  allowDevAuth: bool('ALLOW_DEV_AUTH', !botToken),


  yookassa: {
    shopId: str('YOOKASSA_SHOP_ID'),
    secretKey: str('YOOKASSA_SECRET_KEY'),
    vatCode: num('YOOKASSA_VAT_CODE', 1),
    receipt: bool('YOOKASSA_RECEIPT', true),
    get enabled() {
      return Boolean(this.shopId && this.secretKey);
    },
  },

  seller: {
    name: str('SELLER_NAME'),
    legalName: str('SELLER_LEGAL_NAME'),
    inn: str('SELLER_INN'),
    kpp: str('SELLER_KPP'),
    ogrn: str('SELLER_OGRN'),
    address: str('SELLER_ADDRESS'),
    bankName: str('SELLER_BANK_NAME'),
    bik: str('SELLER_BANK_BIK'),
    account: str('SELLER_BANK_ACCOUNT'),
    corrAccount: str('SELLER_CORR_ACCOUNT'),
    signer: str('SELLER_SIGNER'),
    phone: str('SELLER_PHONE'),
    email: str('SELLER_EMAIL'),
    invoicePrefix: str('INVOICE_PREFIX', 'ПЛ-'),
    vat: str('INVOICE_VAT', 'none'),
    get configured() {
      return Boolean(this.inn && this.account);
    },
  },

  shop: {
    freeShippingFrom: num('FREE_SHIPPING_FROM', 30000),
    shippingCost: num('SHIPPING_COST', 790),
    minOrderTotal: num('MIN_ORDER_TOTAL', 0),
  },
};

/** Список включённых способов оплаты для витрины. */
export function paymentMethods() {
  return [
    {
      id: 'yookassa',
      title: 'Картой онлайн',
      subtitle: 'ЮKassa · Visa, Mastercard, МИР, СБП',
      enabled: config.yookassa.enabled,
      hint: config.yookassa.enabled ? '' : 'Эквайринг не подключён',
    },
    {
      id: 'invoice',
      title: 'Счёт для юрлица',
      subtitle: 'Оплата по реквизитам, закрывающие документы',
      enabled: true,
      hint: '',
    },
  ];
}

export function isAdmin(userId) {
  return config.telegram.adminIds.includes(Number(userId));
}
