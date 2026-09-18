/**
 * Точка входа. MODE=all|web|bot — что запускать (по умолчанию всё сразу,
 * один процесс на BotHost: веб-приложение + бот).
 */
import { config } from './config.js';
import { catalogHealth, restoreBaseCatalog } from './catalog.js';
import { startServer } from './server.js';
import { startBot } from './bot/index.js';

const mode = config.mode;

/**
 * Страховка от «пустой витрины»: если в прайсе (data/catalog.json) позиции есть,
 * а на витрине не видно ни одной — значит товары пометили удалёнными/скрытыми
 * (например, случайно или старой версией админки). Возвращаем их из прайса.
 */
function healEmptyCatalog() {
  const health = catalogHealth();
  if (!health.baseTotal) {
    console.error('[catalog] в data/catalog.json нет товаров — витрина будет пустой. Пересоберите прайс: npm run catalog');
    return;
  }
  if (!health.broken) {
    if (health.deleted) {
      console.warn(`[catalog] удалено из каталога: ${health.deleted} поз. — вернуть: /admin → Каталог → «Вернуть всё из прайса»`);
    }
    return;
  }
  const res = restoreBaseCatalog();
  console.warn(
    `[catalog] витрина была пустой — вернул из прайса ${res.restored} поз.` +
    `${res.unhidden ? `, снял скрытие с ${res.unhidden}` : ''}; сейчас видно ${res.visible}`,
  );
}

async function main() {
  console.log('«Посудная лавка» · запуск, режим:', mode);
  healEmptyCatalog();

  if (mode === 'all' || mode === 'web') {
    await startServer();
  }
  if (mode === 'all' || mode === 'bot') {
    try {
      await startBot();
    } catch (err) {
      console.error('[bot] не удалось запустить:', err.message);
    }
  }
}

main().catch((err) => {
  console.error('Критическая ошибка запуска:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
