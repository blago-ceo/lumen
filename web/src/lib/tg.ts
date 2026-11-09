/* Тонкая обёртка над Telegram WebApp SDK с безопасными фолбэками для браузера */
type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

export const tg: any = (window as any).Telegram?.WebApp;
export const inTelegram = !!tg?.initData;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.('#000000');
    tg.setBackgroundColor?.('#000000');
    tg.setBottomBarColor?.('#000000');
    tg.disableVerticalSwipes?.();
  } catch {
    /* старые клиенты */
  }
  const applySafe = () => {
    const top = (tg.contentSafeAreaInset?.top ?? 0) + (tg.safeAreaInset?.top ?? 0);
    document.documentElement.style.setProperty('--tg-safe-top', `${top}px`);
  };
  applySafe();
  tg.onEvent?.('safeAreaChanged', applySafe);
  tg.onEvent?.('contentSafeAreaChanged', applySafe);
}

export const haptic = {
  tap: (s: Haptic = 'light') => tg?.HapticFeedback?.impactOccurred(s),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

export function openLink(url: string) {
  if (!url) return;
  if (tg && /^https:\/\/t\.me\//.test(url)) return tg.openTelegramLink(url);
  if (tg?.openLink) return tg.openLink(url);
  window.open(url, '_blank', 'noopener');
}

export function openInvoice(link: string): Promise<string> {
  return new Promise((resolve) => {
    if (tg?.openInvoice) tg.openInvoice(link, (status: string) => resolve(status));
    else {
      window.open(link, '_blank');
      resolve('external');
    }
  });
}

/** Системная кнопка «Назад» Telegram для оверлеев; возвращает функцию снятия */
export function showBack(cb: () => void) {
  if (!tg?.BackButton) return () => {};
  tg.BackButton.show();
  tg.BackButton.onClick(cb);
  return () => {
    tg.BackButton.offClick(cb);
    tg.BackButton.hide();
  };
}

/** SVG-фильтры в backdrop-filter есть только в Chromium → включаем «жидкое» преломление там */
export function detectLiquid() {
  const ua = navigator.userAgent;
  const isChromium = /Chrome\/\d+/.test(ua) || /Android/.test(ua);
  const isApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && !/Chrome/.test(ua));
  if (isChromium && !isApple) document.documentElement.classList.add('has-liquid');
}
