/** Админка: бренд, контакты, менеджеры, доставка, реквизиты, тексты. */
import { h, tap, section, group, field, cell, toast, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { refreshCatalog } from '../state.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

function saveButton(label, onSave) {
  const btn = h('button.btn.secondary', label);
  tap(btn, async () => {
    btn.disabled = true;
    try {
      await onSave();
      await refreshCatalog();
      toast('Сохранено');
    } catch (err) {
      toast(err.message || 'Ошибка', 3000);
    } finally {
      btn.disabled = false;
    }
  });
  return h('div', { style: { padding: '10px 16px 0' } }, btn);
}

export default async function adminInfoView() {
  const denied = adminGuard('Магазин и контакты');
  if (denied) return denied;

  let info;
  try {
    info = await api.adminShopInfo();
  } catch (err) {
    return { title: 'Магазин', content: h('.empty', h('.emoji', '⚠️'), h('h3', 'Ошибка загрузки'), h('p', err.message)) };
  }

  const brand = info.brand || {};
  const delivery = info.delivery || {};
  const shop = info.shop || {};
  const seller = info.seller || {};
  const texts = info.texts || {};
  let managers = [...(brand.managers || [])];

  // ── бренд ──
  const fTitle = field({ label: 'Заголовок', value: brand.title || '' });
  const fName = field({ label: 'Name', value: brand.name || '' });
  const fTagline = field({ label: 'Слоган', value: brand.tagline || '' });

  // ── контакты ──
  const fTg = field({ label: 'Telegram', placeholder: 'канал без @', value: brand.telegram || '' });
  const fInst = field({ label: 'Instagram', placeholder: 'без @', value: brand.instagram || '' });
  const fEmail = field({ label: 'E-mail', placeholder: 'sales@…', value: brand.email || '', type: 'email' });

  // ── менеджеры ──
  const mgrList = h('div');
  function renderManagers() {
    mgrList.innerHTML = '';
    if (!managers.length) mgrList.append(h('.section-footer', { style: { padding: '0 4px 8px' } }, 'Пока никого нет'));
    managers.forEach((m, i) => {
      mgrList.append(h('.cell',
        h('.cell-body',
          h('.cell-title', m.region || `Менеджер ${i + 1}`),
          h('.cell-sub', `@${m.telegram || '—'} · ${m.phone || '—'}`)),
        tap(h('button.nav-btn.icon', { style: { color: 'var(--red)' }, html: icon('trash', 19) }), () => {
          managers.splice(i, 1);
          renderManagers();
        })));
    });
  }
  renderManagers();
  const fMgrRegion = field({ label: 'Регион', placeholder: 'Москва и регионы' });
  const fMgrTg = field({ label: 'Telegram', placeholder: 'username без @' });
  const fMgrPhone = field({ label: 'Телефон', placeholder: '+7 …', type: 'tel' });

  // ── доставка ──
  const fNote = field({ label: 'Текст', placeholder: 'Про сроки и условия…', value: delivery.note || '', multiline: true });
  fNote.input.rows = 4;
  const fCities = field({ label: 'Города', placeholder: 'Москва, Санкт-Петербург', value: (delivery.freeCities || []).join(', ') });

  // ── продажи ──
  const fFreeFrom = field({ label: 'Бесплатно от', placeholder: '30000', value: String(shop.freeShippingFrom ?? ''), type: 'number', inputmode: 'numeric' });
  const fShipCost = field({ label: 'Доставка, ₽', placeholder: '790', value: String(shop.shippingCost ?? ''), type: 'number', inputmode: 'numeric' });
  const fMinOrder = field({ label: 'Мин. заказ', placeholder: '0 — без минимума', value: String(shop.minOrderTotal ?? ''), type: 'number', inputmode: 'numeric' });

  // ── реквизиты ──
  const fLegal = field({ label: 'Юр. лицо', value: seller.legalName || '' });
  const fInn = field({ label: 'ИНН', value: seller.inn || '', inputmode: 'numeric' });
  const fKpp = field({ label: 'КПП', value: seller.kpp || '', inputmode: 'numeric' });
  const fOgrn = field({ label: 'ОГРН', value: seller.ogrn || '', inputmode: 'numeric' });
  const fAddr = field({ label: 'Адрес', value: seller.address || '' });
  const fBank = field({ label: 'Банк', value: seller.bankName || '' });
  const fBik = field({ label: 'БИК', value: seller.bik || '', inputmode: 'numeric' });
  const fAcc = field({ label: 'Р/с', value: seller.account || '', inputmode: 'numeric' });
  const fCorr = field({ label: 'К/с', value: seller.corrAccount || '', inputmode: 'numeric' });
  const fSigner = field({ label: 'Подписант', value: seller.signer || '' });
  const fSellerPhone = field({ label: 'Телефон', value: seller.phone || '', type: 'tel' });
  const fSellerEmail = field({ label: 'E-mail', value: seller.email || '', type: 'email' });
  const fPrefix = field({ label: 'Префикс', value: seller.invoicePrefix || '' });
  let vat = seller.vat || 'none';
  const vatSeg = h('.segmented');
  for (const v of ['none', '10', '20']) {
    const b = h('button', { class: vat === v ? 'active' : '' }, v === 'none' ? 'без НДС' : `${v}%`);
    tap(b, () => {
      vat = v;
      [...vatSeg.children].forEach((el, i) => el.classList.toggle('active', ['none', '10', '20'][i] === v));
    }, 'select');
    vatSeg.append(b);
  }

  // ── тексты ──
  const fWelcome = field({ label: 'Привет', placeholder: '{name} — имя пользователя', value: texts.welcome || '', multiline: true });
  fWelcome.input.rows = 5;
  const fDelivery = field({ label: 'Доставка', placeholder: 'Текст «Доставка и оплата»', value: texts.delivery || '', multiline: true });
  fDelivery.input.rows = 5;
  const fAbout = field({ label: 'О бренде', placeholder: 'Абзацы через пустую строку', value: texts.about || '', multiline: true });
  fAbout.input.rows = 5;
  const fFooter = field({ label: 'Подпись', value: texts.footerNote || '' });

  const content = h('div',
    section('Бренд', group(fTitle, fName, fTagline)),
    saveButton('Сохранить бренд', () => api.adminSaveShopInfo({ brand: {
      title: fTitle.input.value.trim(), name: fName.input.value.trim(), tagline: fTagline.input.value.trim(),
    } })),

    section('Контакты', group(fTg, fInst, fEmail)),
    saveButton('Сохранить контакты', () => api.adminSaveShopInfo({ brand: {
      telegram: fTg.input.value.trim().replace(/^@+/, ''),
      instagram: fInst.input.value.trim().replace(/^@+/, ''),
      email: fEmail.input.value.trim(),
    } })),

    section('Менеджеры', group(mgrList)),
    section('', group(fMgrRegion, fMgrTg, fMgrPhone)),
    h('div', { style: { padding: '10px 16px 0', display: 'flex', gap: '10px' } },
      tap(h('button.btn.secondary', { style: { flex: 1 } }, 'Добавить'), () => {
        const region = fMgrRegion.input.value.trim();
        if (!region) return toast('Укажите регион');
        managers.push({
          region,
          telegram: fMgrTg.input.value.trim().replace(/^@/, ''),
          phone: fMgrPhone.input.value.trim(),
        });
        fMgrRegion.input.value = ''; fMgrTg.input.value = ''; fMgrPhone.input.value = '';
        renderManagers();
      }),
      tap(h('button.btn', { style: { flex: 1 } }, 'Сохранить'), async () => {
        try {
          await api.adminSaveShopInfo({ brand: { managers } });
          await refreshCatalog();
          toast('Сохранено');
        } catch (err) { toast(err.message || 'Ошибка', 3000); }
      })),

    section('Доставка', group(fNote, fCities)),
    saveButton('Сохранить доставку', () => api.adminSaveShopInfo({ delivery: {
      note: fNote.input.value.trim(),
      freeCities: fCities.input.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
    } })),

    section('Пороги и минимум', group(fFreeFrom, fShipCost, fMinOrder)),
    saveButton('Сохранить пороги', () => api.adminSaveShopInfo({ shop: {
      freeShippingFrom: Number.parseInt(fFreeFrom.input.value, 10) || 0,
      shippingCost: Number.parseInt(fShipCost.input.value, 10) || 0,
      minOrderTotal: Number.parseInt(fMinOrder.input.value, 10) || 0,
    } })),

    section(`Реквизиты ${seller.configured ? '✅' : '⚠️'}`, group(
      fLegal, fInn, fKpp, fOgrn, fAddr, fBank, fBik, fAcc, fCorr, fSigner, fSellerPhone, fSellerEmail, fPrefix,
      h('.cell', h('.cell-body', h('.cell-title', 'НДС в счёте')), vatSeg),
    )),
    saveButton('Сохранить реквизиты', () => api.adminSaveShopInfo({ seller: {
      legalName: fLegal.input.value.trim(), inn: fInn.input.value.trim(), kpp: fKpp.input.value.trim(),
      ogrn: fOgrn.input.value.trim(), address: fAddr.input.value.trim(), bankName: fBank.input.value.trim(),
      bik: fBik.input.value.trim(), account: fAcc.input.value.trim(), corrAccount: fCorr.input.value.trim(),
      signer: fSigner.input.value.trim(), phone: fSellerPhone.input.value.trim(),
      email: fSellerEmail.input.value.trim(), invoicePrefix: fPrefix.input.value.trim(), vat,
    } })),

    section('Тексты бота и витрины', group(fWelcome, fDelivery, fAbout, fFooter)),
    saveButton('Сохранить тексты', () => api.adminSaveShopInfo({ texts: {
      welcome: fWelcome.input.value.trim(), delivery: fDelivery.input.value.trim(),
      about: fAbout.input.value.trim(), footerNote: fFooter.input.value.trim(),
    } })),

    h('div', { style: { height: '10px' } }),
  );

  return { title: 'Магазин и контакты', tab: 'profile', tabbar: false, content };
}
