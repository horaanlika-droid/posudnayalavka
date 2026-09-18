/** Админка: создание и редактирование товара — все поля, фото, метки. */
import { h, tap, money, section, group, field, toast, confirmDialog, sheet, spinnerBlock } from '../ui.js';
import { icon } from '../icons.js';
import { back } from '../router.js';
import { state, refreshCatalog } from '../state.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

const MAX_PHOTO = 6 * 1024 * 1024;

function toggleRow(title, sub, initial, onChange) {
  let on = Boolean(initial);
  const sw = h('.switch', { class: on ? 'on' : '' });
  return tap(h('.cell',
    h('.cell-body', h('.cell-title', title), sub ? h('.cell-sub', sub) : null),
    sw),
  () => {
    on = !on;
    sw.classList.toggle('on', on);
    onChange(on);
  }, 'select');
}

export default async function adminProductView({ id, product }) {
  const denied = adminGuard('Товар');
  if (denied) return denied;
  const isNew = id === 'new';

  let p = product || null;
  if (!isNew && !p) {
    try {
      const res = await api.adminProducts(String(id));
      p = res.products.find((x) => String(x.id) === String(id)) || null;
    } catch {}
  }
  if (!isNew && !p) {
    return { title: 'Товар', content: h('.empty', h('h3', 'Товар не найден')) };
  }
  p = p || {};

  let categories = state.categories;
  try {
    categories = (await api.adminCategories()).categories;
  } catch {}

  let category = p.category || categories[0]?.id || '';
  let isNewFlag = isNew ? true : Boolean(p.isNew);
  let isHit = Boolean(p.isHit);
  let hidden = Boolean(p.hidden);
  let outOfStock = Boolean(p.outOfStock);
  let photoData = null;
  let photoRemoved = false;

  const catTitle = () => categories.find((c) => c.id === category)?.title || 'Выбрать';

  const fName = field({ label: 'Название', placeholder: 'Highball 400', value: p.name || '' });
  const fArticle = field({ label: 'Артикул', placeholder: 'авто', value: p.article || '' });
  const fPrice = field({ label: 'Цена, ₽', placeholder: '490', value: p.price ? String(p.price) : '', type: 'number', inputmode: 'numeric' });
  const fVol = field({ label: 'Объём, мл', placeholder: '400', value: p.volumeMl ? String(p.volumeMl) : '', type: 'number', inputmode: 'numeric' });
  const fVolLabel = field({ label: 'Подпись', placeholder: '400 мл / набор 6 шт', value: p.volumeLabel || '' });
  const fPieces = field({ label: 'Штук', placeholder: '1', value: p.pieces ? String(p.pieces) : '1', type: 'number', inputmode: 'numeric' });
  const fDescr = field({ label: 'Описание', placeholder: 'Пара предложений о товаре…', value: p.description || '', multiline: true });
  fDescr.input.rows = 4;

  const catBtn = tap(h('.cell.tappable',
    h('.cell-body', h('.cell-title', 'Категория')),
    h('.cell-value', catTitle()),
    h('.cell-chevron', { html: icon('chevron', 14) })),
  () => {
    const rows = categories.map((c) => {
      const check = h('span', { style: { color: 'var(--accent)', opacity: c.id === category ? 1 : 0 }, html: icon('check', 18) });
      return tap(h('.cell.tappable',
        h('.cell-body', h('.cell-title', `${c.emoji ? `${c.emoji} ` : ''}${c.title}`), c.subtitle ? h('.cell-sub', c.subtitle) : null),
        check),
      () => {
        category = c.id;
        catBtn.querySelector('.cell-value').textContent = catTitle();
        dlg.close();
      }, 'select');
    });
    const dlg = sheet({ title: 'Категория', body: h('div', section('', group(...rows))) });
  }, 'select');

  // фото
  const photoImg = h('img', { src: p.image || '', style: { display: p.image ? '' : 'none' } });
  const photoEmpty = h('.photo-empty', { style: { display: p.image ? 'none' : '' } }, '🍸');
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO) {
      toast('Фото слишком большое (максимум 6 МБ)', 3000);
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoData = String(reader.result);
      photoRemoved = false;
      photoImg.src = photoData;
      photoImg.style.display = '';
      photoEmpty.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
  const photoBox = h('.photo-box',
    h('.photo-preview', photoImg, photoEmpty),
    h('.photo-actions',
      tap(h('button.btn.small.secondary', 'Выбрать фото'), () => fileInput.click()),
      tap(h('button.btn.small.ghost', 'Убрать'), () => {
        photoData = null;
        photoRemoved = true;
        fileInput.value = '';
        photoImg.src = '';
        photoImg.style.display = 'none';
        photoEmpty.style.display = '';
      })));

  const saveBtn = h('button.btn', isNew ? 'Создать товар' : 'Сохранить');
  tap(saveBtn, async () => {
    const name = fName.input.value.trim();
    const price = Number.parseInt(fPrice.input.value.replace(/[^\d]/g, ''), 10);
    const volumeMl = Number.parseInt(fVol.input.value.replace(/[^\d]/g, ''), 10);
    let volumeLabel = fVolLabel.input.value.trim();
    const pieces = Math.max(1, Math.min(999, Number.parseInt(fPieces.input.value, 10) || 1));
    if (!name) return toast('Укажите название');
    if (!category) return toast('Выберите категорию');
    if (!Number.isFinite(price) || price <= 0) return toast('Укажите цену');
    if (Number.isFinite(volumeMl) && volumeMl > 0 && !volumeLabel) volumeLabel = `${volumeMl} мл`;

    const payload = {
      name,
      article: fArticle.input.value.trim(),
      category,
      price,
      volumeMl: Number.isFinite(volumeMl) && volumeMl > 0 ? volumeMl : null,
      volumeLabel,
      pieces,
      description: fDescr.input.value.trim(),
      isNew: isNewFlag,
      isHit,
      hidden,
      outOfStock,
    };
    if (photoData) payload.photoData = photoData;
    else if (photoRemoved) payload.image = '';

    saveBtn.disabled = true;
    try {
      if (isNew) await api.adminCreateProduct(payload);
      else await api.adminUpdateProduct(id, payload);
      await refreshCatalog();
      toast(isNew ? 'Товар создан' : 'Сохранено');
      back();
    } catch (err) {
      toast(err.message || 'Ошибка сохранения', 3000);
    } finally {
      saveBtn.disabled = false;
    }
  });

  const content = h('div',
    photoBox,
    section('Основное', group(fName, fArticle, catBtn, fPrice)),
    section('Характеристики', group(fVol, fVolLabel, fPieces, fDescr)),
    section('Показ', group(
      toggleRow('Новинка', 'Бейдж «Новинка» и фильтр', isNewFlag, (v) => { isNewFlag = v; }),
      toggleRow('Хит', 'Подборка «Популярное»', isHit, (v) => { isHit = v; }),
      toggleRow('Скрыт из каталога', 'Виден только в админке', hidden, (v) => { hidden = v; }),
      toggleRow('Нет в наличии', 'Нельзя добавить в корзину', outOfStock, (v) => { outOfStock = v; }),
    )),
    h('div', { style: { padding: '18px 16px 0' } }, saveBtn),
    isNew ? null : h('div', { style: { padding: '10px 16px 0' } },
      tap(h('button.btn.danger', 'Удалить товар'), async () => {
        const ok = await confirmDialog({ title: 'Удалить товар?', message: p.name || '', okText: 'Удалить', destructive: true });
        if (!ok) return;
        try {
          await api.adminDeleteProduct(id);
          await refreshCatalog();
          toast('Товар удалён');
          back();
        } catch (err) {
          toast(err.message || 'Ошибка удаления', 3000);
        }
      })),
    h('div', { style: { height: '8px' } }),
  );

  return {
    title: isNew ? 'Новый товар' : (p.name || 'Товар').slice(0, 24),
    tab: 'profile',
    tabbar: false,
    content,
  };
}
