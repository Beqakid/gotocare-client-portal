// ══════════════════════════════════════════
// Google OAuth helpers
// ══════════════════════════════════════════

export const GOOGLE_CLIENT_ID = '888877756290-t1chv8b5d5hg0kiosd4qcr34g6rpd33b.apps.googleusercontent.com';

declare global {
  interface Window {
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

export function initGoogleOneTap(
  callback: (credential: string, name: string, email: string, googleId: string) => void
): void {
  if (!isGoogleReady()) return;

  window.google!.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    callback: (response) => {
      const payload = parseJwtPayload(response.credential);
      callback(
        response.credential,
        payload.name || '',
        payload.email || '',
        payload.sub || ''
      );
    },
  });

  window.google!.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      const btn = document.getElementById('auth-google-btn');
      if (btn) {
        window.google!.accounts.id.renderButton(btn, {
          type: 'standard', shape: 'rectangular', theme: 'outline', size: 'large',
        });
      }
    }
  });
}
