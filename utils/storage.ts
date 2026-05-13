// ══════════════════════════════════════════
// localStorage key constants — single source of truth
// ══════════════════════════════════════════

export const KEYS = {
  SESSION:    'gc_client_session',  // session token
  EMAIL:      'gc_email',           // client email
  NAME:       'gc_client_name',     // client display name
  SHORTLIST:  'gc_shortlist_local', // shortlisted caregivers (JSON)
  PREFS_LOC:  'gc_last_location',
  PREFS_CARE: 'gc_last_care_types',
} as const;

// ── Session ──────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem(KEYS.SESSION);
}

export function setToken(token: string): void {
  localStorage.setItem(KEYS.SESSION, token);
}

export function getEmail(): string | null {
  return localStorage.getItem(KEYS.EMAIL);
}

export function setEmail(email: string): void {
  localStorage.setItem(KEYS.EMAIL, email);
}

export function getName(): string | null {
  return localStorage.getItem(KEYS.NAME);
}

export function setName(name: string): void {
  localStorage.setItem(KEYS.NAME, name);
}

export function clearSession(): void {
  localStorage.removeItem(KEYS.SESSION);
  localStorage.removeItem(KEYS.EMAIL);
  localStorage.removeItem(KEYS.NAME);
  localStorage.removeItem(KEYS.SHORTLIST);
  localStorage.removeItem(KEYS.PREFS_LOC);
  localStorage.removeItem(KEYS.PREFS_CARE);
}

// ── Shortlist ─────────────────────────────
export function getShortlistLocal<T>(): T[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.SHORTLIST) || '[]');
  } catch {
    return [];
  }
}

export function setShortlistLocal<T>(list: T[]): void {
  localStorage.setItem(KEYS.SHORTLIST, JSON.stringify(list));
}

// ── Preferences ───────────────────────────
export function getLastLocation(): string {
  return localStorage.getItem(KEYS.PREFS_LOC) || '';
}

export function setLastLocation(loc: string): void {
  localStorage.setItem(KEYS.PREFS_LOC, loc);
}

export function getLastCareTypes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.PREFS_CARE) || '[]');
  } catch {
    return [];
  }
}

export function setLastCareTypes(types: string[]): void {
  localStorage.setItem(KEYS.PREFS_CARE, JSON.stringify(types));
}

// ── Per-booking status ────────────────────
export function getBookingStatus(caregiverId: number | string): Record<string, unknown> | null {
  try {
    return JSON.parse(localStorage.getItem(`gc_booked_${caregiverId}`) || 'null');
  } catch {
    return null;
  }
}

export function setBookingStatus(caregiverId: number | string, data: Record<string, unknown>): void {
  localStorage.setItem(`gc_booked_${caregiverId}`, JSON.stringify(data));
}
