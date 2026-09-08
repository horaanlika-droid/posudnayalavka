/**
 * Точка входа. MODE=all|web|bot — что запускать (по умолчанию всё сразу,
 * один процесс на BotHost: веб-приложение + бот).
 */
import { config } from './config.js';
import { startServer } from './server.js';
import { startBot } from './bot/index.js';

const mode = config.mode;

async function main() {
  console.log('«Посудная лавка» · запуск, режим:', mode);

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
