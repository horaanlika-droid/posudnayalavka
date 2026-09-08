/** Детали заказа: статус, состав, оплата и счёт. */
import { h, tap, money, section, toast, spinnerBlock, dateShort, timeShort, confirmDialog, appendAll } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, refresh } from '../router.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { statusChip } from './orders.js';

const FLOW = ['new', 'paid', 'packing', 'shipped', 'done'];

export default function orderView({ id, justCreated, awaitingPayment }) {
  const box = h('div', spinnerBlock('Загружаем заказ…'));
  let poll = null;

  async function render() {
    let data;
    try {
      data = await api.order(id);
    } catch (err) {
      box.innerHTML = '';
      box.append(h('.empty', h('h3', 'Заказ не найден')));
      return;
    }
    const { order, invoice } = data;
    const statusMeta = state.config?.statuses || {};
    const currentIndex = FLOW.indexOf(order.status);

    const timeline = order.status === 'canceled'
      ? h('ul.timeline', h('li.done', 'Заказ отменён'))
      : h('ul.timeline', ...FLOW.map((st, i) =>
        h('li', { class: i <= currentIndex ? 'done' : '' },
          `${statusMeta[st]?.emoji || ''} ${statusMeta[st]?.title || st}`)));

    const actions = [];

    if (order.paymentMethod === 'yookassa' && order.paymentStatus !== 'paid' && order.status !== 'canceled') {
      actions.push(tap(h('button.btn', 'Проверить оплату'), async () => {
        const res = await api.checkOrder(order.id);
        if (res.paid) {
          tg.haptic('success');
          toast('Оплата получена, спасибо!');
          render();
        } else {
          tg.haptic('warning');
          toast('Оплата пока не поступила');
        }
      }));
    }

    if (invoice) {
      actions.push(tap(h('button.btn', h('span', { html: icon('doc', 18) }), h('span', 'Открыть счёт')), () => {
        const url = invoice.url.startsWith('http') ? invoice.url : `${location.origin}/invoice/${order.id}?k=${order.invoiceKey || ''}`;
        tg.openLink(url);
      }));
    }

    if (!['done', 'canceled'].includes(order.status) && order.paymentStatus !== 'paid') {
      actions.push(tap(h('button.btn.danger', 'Отменить заказ'), async () => {
        const ok = await confirmDialog({ title: 'Отменить заказ?', message: order.number, okText: 'Отменить заказ', destructive: true });
        if (!ok) return;
        await api.cancelOrder(order.id);
        toast('Заказ отменён');
        render();
      }));
    }

    actions.push(tap(h('button.btn.secondary', h('span', { html: icon('chat', 18) }), h('span', 'Написать в поддержку')),
      () => navigate('support', { prefill: `Вопрос по заказу ${order.number}: ` })));

    box.innerHTML = '';
    appendAll(box,
      justCreated
        ? h('.notice', order.paymentMethod === 'invoice'
          ? `Заказ принят. Счёт № ${order.invoiceNumber} сформирован — откройте его кнопкой ниже, оплатите с расчётного счёта, и мы начнём сборку.`
          : 'Заказ принят. Мы уже видим его в системе.')
        : null,
      awaitingPayment ? h('.notice', 'Окно оплаты открыто в браузере. После оплаты вернитесь сюда и нажмите «Проверить оплату».') : null,

      h('div', { style: { padding: '18px 16px 0' } },
        h('.hstack', h('h1', { style: { margin: 0, fontSize: '26px', letterSpacing: '-0.6px' } }, order.number), h('.spacer'), statusChip(order)),
        h('.tiny.muted', { style: { marginTop: '4px' } }, `Создан ${dateShort(order.createdAt)} в ${timeShort(order.createdAt)}`)),

      section('Статус', h('.group', h('.cell', { style: { display: 'block', padding: '14px' } }, timeline))),

      section('Состав',
        h('.group',
          ...order.items.map((it) => h('.cart-item',
            h('.cart-thumb', it.image ? h('img', { src: it.image, alt: '' }) : null),
            h('.cart-body',
              h('.cart-name', it.name),
              h('.cart-sub', `${it.volumeLabel || ''} · арт. ${it.article}`),
              h('.cart-row', h('span.tiny.muted', `${it.qty} × ${money(it.price)}`), h('span.cart-price', money(it.price * it.qty)))))),
          h('.summary-row', h('span', 'Товары'), h('span.mono', money(order.subtotal))),
          h('.summary-row', h('span', 'Доставка'), order.shipping ? h('span.mono', money(order.shipping)) : h('span.free', 'бесплатно')),
          h('.summary-row.total', h('span', 'Итого'), h('span.mono', money(order.total))))),

      section('Оплата',
        h('.group',
          h('.cell', h('.cell-icon', { html: icon(order.paymentMethod === 'invoice' ? 'doc' : 'card', 18) }),
            h('.cell-body',
              h('.cell-title', order.paymentMethod === 'invoice' ? 'Счёт для юрлица' : 'Картой онлайн (ЮKassa)'),
              h('.cell-sub', order.paymentStatus === 'paid' ? 'Оплачен' : order.paymentStatus === 'canceled' ? 'Платёж отменён' : 'Ожидает оплаты'))),
          invoice ? h('.cell', h('.cell-body', h('.cell-title', 'Номер счёта')), h('.cell-value', invoice.number)) : null,
          invoice?.seller?.configured
            ? h('.cell', { style: { display: 'block', padding: '12px 14px' } },
              h('.tiny.muted', { style: { lineHeight: '1.5' } },
                `${invoice.seller.legalName || ''}\nИНН ${invoice.seller.inn} · р/с ${invoice.seller.account}\n${invoice.seller.bankName} · БИК ${invoice.seller.bik}`))
            : null)),

      section('Доставка',
        h('.group',
          h('.cell', h('.cell-body', h('.cell-title', order.delivery.methodTitle),
            h('.cell-sub', [order.delivery.city, order.delivery.address].filter(Boolean).join(', ') || 'Уточним при подтверждении'))),
          h('.cell', h('.cell-body', h('.cell-title', 'Получатель'), h('.cell-sub', `${order.customer.name} · ${order.customer.phone}`))),
          order.company ? h('.cell', h('.cell-body', h('.cell-title', order.company.name), h('.cell-sub', `ИНН ${order.company.inn}`))) : null)),

      order.comment ? section('Комментарий', h('.group', h('.cell', h('.cell-body', h('.cell-sub', order.comment))))) : null,

      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px 16px 30px' } }, ...actions),
    );

    // автопроверка оплаты после возврата из ЮKassa
    if (order.paymentMethod === 'yookassa' && order.paymentStatus !== 'paid' && order.status !== 'canceled') {
      clearInterval(poll);
      let attempts = 0;
      poll = setInterval(async () => {
        attempts += 1;
        if (attempts > 40) return clearInterval(poll);
        try {
          const res = await api.checkOrder(order.id);
          if (res.paid) {
            clearInterval(poll);
            tg.haptic('success');
            toast('Оплата получена!');
            render();
          }
        } catch {}
      }, 6000);
    }
  }

  return {
    title: 'Заказ',
    tabbar: false,
    content: box,
    onMount: render,
    onDestroy: () => clearInterval(poll),
  };
}
