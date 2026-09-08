/** Оформление заказа: контакты, доставка, способ оплаты, счёт для юрлиц. */
import { h, tap, money, section, field, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { navigate, back } from '../router.js';
import { tg } from '../tg.js';
import { api } from '../api.js';
import { state, cartDetailed, cartSubtotal, shippingFor, saveDraft, clearCart } from '../state.js';

const PAY_ICONS = { yookassa: 'card', invoice: 'doc' };

export default function checkoutView() {
  const items = cartDetailed();
  if (!items.length) {
    setTimeout(() => navigate('catalog', {}, { replaceStack: true, tab: 'catalog' }), 0);
    return { title: 'Оформление', content: h('div') };
  }

  const draft = state.draft;
  const methods = state.config?.delivery?.methods || [];
  const payments = (state.config?.payments || []).filter((p) => p.enabled || p.id === 'yookassa');
  if (!draft.payment) draft.payment = payments.find((p) => p.enabled)?.id || 'invoice';

  const subtotalEl = h('span.mono');
  const shippingEl = h('span.mono');
  const totalEl = h('span.mono');
  let total = 0;

  function recalc() {
    const subtotal = cartSubtotal();
    const shipping = shippingFor(subtotal, draft.delivery.method);
    total = subtotal + shipping;
    subtotalEl.textContent = money(subtotal);
    shippingEl.textContent = shipping ? money(shipping) : 'бесплатно';
    shippingEl.className = shipping ? 'mono' : 'free';
    totalEl.textContent = money(total);
    if (tg.inTelegram) tg.mainButton({ text: payLabel(), onClick: submit });
    if (payBtn) payBtn.textContent = payLabel();
  }

  const payLabel = () => (draft.payment === 'invoice' ? `Выставить счёт · ${money(total)}` : `Оплатить · ${money(total)}`);

  // ── контакты ───────────────────────────────────────────────
  const nameField = field({
    label: 'Имя', placeholder: 'Как к вам обращаться', value: draft.customer.name,
    onInput: (v) => { draft.customer.name = v; saveDraft({}); },
  });
  const phoneField = field({
    label: 'Телефон', placeholder: '+7 900 000-00-00', type: 'tel', inputmode: 'tel', value: draft.customer.phone,
    onInput: (v) => { draft.customer.phone = v; saveDraft({}); },
  });
  const emailField = field({
    label: 'E-mail', placeholder: 'для чека и документов', type: 'email', inputmode: 'email', value: draft.customer.email,
    onInput: (v) => { draft.customer.email = v; saveDraft({}); },
  });

  // ── доставка ───────────────────────────────────────────────
  const cityField = field({
    label: 'Город', placeholder: 'Москва', value: draft.delivery.city,
    onInput: (v) => { draft.delivery.city = v; saveDraft({}); },
  });
  const addressField = field({
    label: 'Адрес', placeholder: 'Улица, дом, офис / пункт выдачи', value: draft.delivery.address,
    onInput: (v) => { draft.delivery.address = v; saveDraft({}); },
  });

  const deliveryCells = methods.map((m) => {
    const radio = h('.radio', { class: draft.delivery.method === m.id ? 'on' : '' });
    const cell = h('.cell.tappable',
      h('.cell-body', h('.cell-title', m.title),
        h('.cell-sub', m.free ? 'Бесплатно' : `Бесплатно от ${money(state.config.delivery.freeFrom)}, иначе ${money(state.config.delivery.cost)}`)),
      radio);
    tap(cell, () => {
      draft.delivery.method = m.id;
      saveDraft({});
      for (const [i, c] of deliveryCells.entries()) {
        c.querySelector('.radio').classList.toggle('on', methods[i].id === m.id);
      }
      recalc();
    }, 'select');
    return cell;
  });

  // ── оплата ─────────────────────────────────────────────────
  const companyBox = h('div', { class: draft.payment === 'invoice' ? '' : 'hidden' },
    section('Реквизиты юрлица',
      h('.group',
        field({ label: 'Компания', placeholder: 'ООО «Бар»', value: draft.company.name, onInput: (v) => { draft.company.name = v; saveDraft({}); } }),
        field({ label: 'ИНН', placeholder: '10 или 12 цифр', inputmode: 'numeric', value: draft.company.inn, onInput: (v) => { draft.company.inn = v; saveDraft({}); } }),
        field({ label: 'КПП', placeholder: 'если есть', inputmode: 'numeric', value: draft.company.kpp, onInput: (v) => { draft.company.kpp = v; saveDraft({}); } }),
        field({ label: 'Адрес', placeholder: 'Юридический адрес', value: draft.company.address, onInput: (v) => { draft.company.address = v; saveDraft({}); } }),
        field({ label: 'E-mail', placeholder: 'куда прислать счёт', type: 'email', value: draft.company.email, onInput: (v) => { draft.company.email = v; saveDraft({}); } })),
      h('.section-footer', 'Счёт формируется сразу после оформления: его можно скачать в разделе «Заказы». Закрывающие документы отправим на почту.')),
  );

  const payCells = payments.map((p) => {
    const radio = h('.radio', { class: draft.payment === p.id ? 'on' : '' });
    const cell = h('.pay-cell', { class: p.enabled ? '' : 'disabled' },
      h('.pay-logo', { html: icon(PAY_ICONS[p.id] || 'card', 19) }),
      h('.cell-body',
        h('.cell-title', p.title),
        h('.cell-sub', p.enabled ? p.subtitle : p.hint)),
      radio);
    if (p.enabled) {
      tap(cell, () => {
        draft.payment = p.id;
        saveDraft({});
        for (const [i, c] of payCells.entries()) {
          c.querySelector('.radio').classList.toggle('on', payments[i].id === p.id);
        }
        companyBox.classList.toggle('hidden', p.id !== 'invoice');
        recalc();
      }, 'select');
    }
    return cell;
  });

  const commentField = field({
    label: '', placeholder: 'Комментарий к заказу', multiline: true, value: draft.comment,
    onInput: (v) => { draft.comment = v; saveDraft({}); },
  });

  // ── отправка ───────────────────────────────────────────────
  let submitting = false;
  async function submit() {
    if (submitting) return;
    const errors = [];
    if (!draft.customer.name.trim()) errors.push('имя');
    if (draft.customer.phone.replace(/\D/g, '').length < 10) errors.push('телефон');
    if (draft.payment === 'yookassa' && !/^\S+@\S+\.\S+$/.test(draft.customer.email)) errors.push('e-mail для чека');
    if (draft.payment === 'invoice') {
      if (!draft.company.name.trim()) errors.push('название компании');
      if (draft.company.inn.replace(/\D/g, '').length < 10) errors.push('ИНН');
    }
    if (draft.delivery.method !== 'pickup' && !draft.delivery.city.trim()) errors.push('город');

    if (errors.length) {
      tg.haptic('error');
      toast(`Заполните: ${errors.join(', ')}`, 2600);
      return;
    }

    submitting = true;
    tg.haptic('light');
    if (tg.inTelegram) tg.mainButton({ text: 'Отправляем…', progress: true, active: false });
    if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Отправляем…'; }

    try {
      const res = await api.createOrder({
        items: cartDetailed().map((it) => ({ id: it.id, qty: it.qty })),
        customer: draft.customer,
        delivery: draft.delivery,
        company: draft.company,
        comment: draft.comment,
        paymentMethod: draft.payment,
      });
      clearCart();
      tg.haptic('success');

      if (res.confirmationUrl) {
        tg.openLink(res.confirmationUrl);
        navigate('order', { id: res.order.id, awaitingPayment: true }, { replaceStack: true, tab: 'profile' });
      } else {
        navigate('order', { id: res.order.id, justCreated: true }, { replaceStack: true, tab: 'profile' });
      }
    } catch (err) {
      tg.haptic('error');
      toast(err.message || 'Не удалось оформить заказ', 3200);
      submitting = false;
      if (payBtn) { payBtn.disabled = false; payBtn.textContent = payLabel(); }
      recalc();
    }
  }

  const payBtn = h('button.btn');
  tap(payBtn, submit);

  const content = h('div',
    section('Контакты', h('.group', nameField, phoneField, emailField)),
    section('Способ доставки', h('.group', ...deliveryCells)),
    section('Куда доставить', h('.group', cityField, addressField),
      h('.section-footer', state.config?.delivery?.note || '')),
    section('Оплата', h('.group', ...payCells)),
    companyBox,
    section('Комментарий', h('.group', commentField)),
    section('Ваш заказ',
      h('.group',
        ...items.map((it) => h('.summary-row',
          h('span', { style: { color: 'var(--label-2)' } }, `${it.name} × ${it.qty}`),
          h('span.mono', money(it.sum)))),
        h('.summary-row', h('span', 'Товары'), subtotalEl),
        h('.summary-row', h('span', 'Доставка'), shippingEl),
        h('.summary-row.total', h('span', 'К оплате'), totalEl))),
    h('div', { style: { padding: '18px 16px 8px' } }, payBtn),
    h('.section-footer', { style: { padding: '0 20px 24px' } },
      'Нажимая кнопку, вы соглашаетесь с условиями продажи и обработкой персональных данных.'),
  );

  recalc();

  return {
    title: 'Оформление',
    tabbar: false,
    content,
    onMount: () => { if (tg.inTelegram) tg.mainButton({ text: payLabel(), onClick: submit }); },
    onDestroy: () => tg.hideMainButton(),
  };
}
