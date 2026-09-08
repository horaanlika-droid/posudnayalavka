/**
 * Обёртка над Telegram WebApp: тактильная отдача, кнопки, тема, безопасные зоны.
 * Приложение работает и вне Telegram (обычный браузер) — тогда используются заглушки.
 */
const wa = window.Telegram?.WebApp;

export const tg = {
  raw: wa,
  inTelegram: Boolean(wa?.initData || wa?.initDataUnsafe?.user),
  initData: wa?.initData || '',
  user: wa?.initDataUnsafe?.user || null,
  platform: wa?.platform || 'unknown',
  version: wa?.version || '0',

  init() {
    if (!wa) return;
    try {
      wa.ready();
      wa.expand();
      if (typeof wa.disableVerticalSwipes === 'function') wa.disableVerticalSwipes();
      if (typeof wa.setHeaderColor === 'function') wa.setHeaderColor('#000000');
      if (typeof wa.setBackgroundColor === 'function') wa.setBackgroundColor('#000000');
      if (typeof wa.requestFullscreen === 'function' && wa.isVersionAtLeast?.('8.0')) {
        // полноэкранный режим включаем только на телефонах
        if (['ios', 'android'].includes(wa.platform)) {
          try { wa.requestFullscreen(); } catch {}
        }
      }
    } catch (err) {
      console.warn('[tg] init', err);
    }
    this.applyInsets();
    wa.onEvent?.('viewportChanged', () => this.applyInsets());
    wa.onEvent?.('safeAreaChanged', () => this.applyInsets());
  },

  applyInsets() {
    if (!wa) return;
    const root = document.documentElement;
    const safe = wa.safeAreaInset || {};
    const content = wa.contentSafeAreaInset || {};
    const top = Math.max(safe.top || 0, content.top || 0);
    if (top) root.style.setProperty('--safe-top', `${top}px`);
    if (safe.bottom) root.style.setProperty('--safe-bottom', `${Math.max(safe.bottom, 0)}px`);
  },

  haptic(type = 'light') {
    const h = wa?.HapticFeedback;
    if (!h) return;
    try {
      if (['success', 'warning', 'error'].includes(type)) h.notificationOccurred(type);
      else if (type === 'select') h.selectionChanged();
      else h.impactOccurred(type);
    } catch {}
  },

  backButton(visible, handler) {
    const b = wa?.BackButton;
    if (!b) return;
    if (this._backHandler) b.offClick(this._backHandler);
    if (visible && handler) {
      this._backHandler = handler;
      b.onClick(handler);
      b.show();
    } else {
      b.hide();
    }
  },

  mainButton({ text, visible = true, active = true, progress = false, onClick } = {}) {
    const b = wa?.MainButton;
    if (!b) return;
    if (this._mainHandler) b.offClick(this._mainHandler);
    if (!visible) { b.hide(); return; }
    b.setParams({ text, color: '#f0985f', text_color: '#1a0f06', is_active: active, is_visible: true });
    if (progress) b.showProgress(false); else b.hideProgress();
    if (onClick) {
      this._mainHandler = onClick;
      b.onClick(onClick);
    }
  },

  hideMainButton() {
    const b = wa?.MainButton;
    if (!b) return;
    if (this._mainHandler) b.offClick(this._mainHandler);
    this._mainHandler = null;
    b.hide();
  },

  openLink(url, options = {}) {
    if (wa?.openLink) wa.openLink(url, { try_instant_view: false, ...options });
    else window.open(url, '_blank', 'noopener');
  },

  openTelegramLink(url) {
    if (wa?.openTelegramLink) wa.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener');
  },

  close() {
    wa?.close?.();
  },

  popup({ title, message, buttons }) {
    return new Promise((resolve) => {
      if (wa?.showPopup && wa.isVersionAtLeast?.('6.2')) {
        try {
          wa.showPopup({ title, message, buttons }, (id) => resolve(id));
          return;
        } catch {}
      }
      resolve(window.confirm(`${title ? `${title}\n\n` : ''}${message}`) ? 'ok' : 'cancel');
    });
  },

  startParam() {
    return wa?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('startapp') || '';
  },
};
