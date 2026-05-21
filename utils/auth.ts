// ══════════════════════════════════════════
// Google OAuth helpers
// ══════════════════════════════════════════

export const GOOGLE_CLIENT_ID = '888877756290-t1chv8b5d5hg0kiosd4qcr34g6rpd33b.apps.googleusercontent.com';

declare global {
  interface Window {
    __carehiaGoogleCallback?: GoogleCallback;
    __carehiaGoogleInitialized?: boolean;
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          prompt: (callback?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
          }) => void) => void;
          renderButton: (el: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export function isGoogleReady(): boolean {
  return !!(window.google?.accounts?.id);
}

export function parseJwtPayload(token: string): { name?: string; email?: string; sub?: string } {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

type GoogleCallback = (credential: string, name: string, email: string, googleId: string) => void;
type GoogleMomentNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};

export function initGoogleOneTap(
  callback: GoogleCallback,
  options: {
    buttonEl?: HTMLElement | null;
    prompt?: boolean;
    onUnavailable?: () => void;
  } = {}
): boolean {
  if (!isGoogleReady()) return false;

  window.__carehiaGoogleCallback = callback;

  if (!window.__carehiaGoogleInitialized) {
    window.google!.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      callback: (response) => {
        const payload = parseJwtPayload(response.credential);
        window.__carehiaGoogleCallback?.(
          response.credential,
          payload.name || '',
          payload.email || '',
          payload.sub || ''
        );
      },
    });
    window.__carehiaGoogleInitialized = true;
  }

  if (options.buttonEl) {
    options.buttonEl.innerHTML = '';
    window.google!.accounts.id.renderButton(options.buttonEl, {
      type: 'standard', shape: 'rectangular', theme: 'outline', size: 'large',
    });
  }

  if (options.prompt !== false) {
    window.google!.accounts.id.prompt((notification: GoogleMomentNotification) => {
      if (
        notification.isNotDisplayed?.() ||
        notification.isSkippedMoment?.() ||
        notification.isDismissedMoment?.()
      ) {
        options.onUnavailable?.();
      }
    });
  }

  return true;
}
