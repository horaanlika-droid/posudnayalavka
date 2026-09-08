import { EventEmitter } from 'node:events';

/**
 * Шина событий между веб-частью и ботом (новый заказ, оплата, сообщение в поддержку).
 * Позволяет не связывать модули напрямую.
 */
export const events = new EventEmitter();
events.setMaxListeners(50);
