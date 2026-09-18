/** Админка: категории каталога — создание, переименование, удаление. */
import { h, tap, section, group, field, cell, toast, sheet, confirmDialog, spinnerBlock } from '../ui.js';
import { icon } from '../icons.js';
import { state, refreshCatalog } from '../state.js';
import { api } from '../api.js';
import { adminGuard } from './admin.js';

export default function adminCatsView() {
  const denied = adminGuard('Категории');
  if (denied) return denied;

  const box = h('div');

  async function load() {
    box.innerHTML = '';
    box.append(spinnerBlock('Загружаем категории…'));
    try {
      const { categories } = await api.adminCategories();
      box.innerHTML = '';
      box.append(section(`Категории · ${categories.length}`, group(
        ...categories.map((c) => cell({
          title: `${c.emoji ? `${c.emoji} ` : ''}${c.title}`,
          sub: [c.subtitle, `ID: ${c.id}${c.custom ? ' · своя' : ''}`].filter(Boolean).join(' · '),
          value: String(c.products ?? 0),
          chevron: true,
          onClick: () => openEditor(c),
        })),
      )));
      box.append(section('', h('.section-footer', 'Категорию с товарами удалить нельзя — сначала перенесите товары в другую категорию.')));
    } catch (err) {
      box.innerHTML = '';
      box.append(h('.empty', h('.emoji', '⚠️'), h('h3', 'Ошибка загрузки'), h('p', err.message)));
    }
  }

  function openEditor(c) {
    const fTitle = field({ label: 'Название', placeholder: 'Хайболы', value: c?.title || '' });
    const fSub = field({ label: 'Подзаголовок', placeholder: 'Long drink', value: c?.subtitle || '' });
    const fEmoji = field({ label: 'Эмодзи', placeholder: '🥤', value: c?.emoji || '' });

    const saveBtn = h('button.btn', c ? 'Сохранить' : 'Создать категорию');
    tap(saveBtn, async () => {
      const payload = {
        title: fTitle.input.value.trim(),
        subtitle: fSub.input.value.trim(),
        emoji: fEmoji.input.value.trim(),
      };
      if (!payload.title) return toast('Укажите название');
      saveBtn.disabled = true;
      try {
        if (c) await api.adminUpdateCategory(c.id, payload);
        else await api.adminCreateCategory(payload);
        await refreshCatalog();
        dlg.close();
        toast(c ? 'Сохранено' : 'Категория создана');
        load();
      } catch (err) {
        toast(err.message || 'Ошибка', 3000);
      } finally {
        saveBtn.disabled = false;
      }
    });

    const actions = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, saveBtn);
    if (c) {
      actions.append(tap(h('button.btn.danger', 'Удалить категорию'), async () => {
        const ok = await confirmDialog({ title: 'Удалить категорию?', message: c.title, okText: 'Удалить', destructive: true });
        if (!ok) return;
        try {
          await api.adminDeleteCategory(c.id);
          await refreshCatalog();
          dlg.close();
          toast('Категория удалена');
          load();
        } catch (err) {
          toast(err.message || 'Ошибка', 3000);
        }
      }));
    }

    const dlg = sheet({
      title: c ? 'Категория' : 'Новая категория',
      body: h('div', section('', group(fTitle, fSub, fEmoji))),
      actions,
    });
  }

  load();

  return {
    title: 'Категории',
    tab: 'profile',
    content: box,
    onReturn: load,
    navRight: tap(h('button.nav-btn.icon', { html: icon('plus', 22) }), () => openEditor(null)),
  };
}
