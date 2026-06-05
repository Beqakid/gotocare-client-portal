// ══════════════════════════════════════════
// Carehia API utility — all fetch calls
// ══════════════════════════════════════════

import { getToken } from './storage';

export const API = 'https://gotocare-original.jjioji.workers.dev/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API + path, options);
  const data = await res.json();
  if (!res.ok && data.error) throw new Error(data.error);
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────
export async function clientLogin(email: string, password: string) {
  return request<{ sessionToken: string; email: string; name: string }>('/client-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function clientRegister(name: string, email: string, password: string) {
  return request<{ sessionToken: string; email: string; name: string }>('/client-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
}

export async function clientGoogleAuth(idToken: string, name: string, email: string, googleId: string) {
  return request<{ sessionToken: string; email: string; name: string }>('/client-auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, name, email, googleId }),
  });
}

// ── Caregivers ────────────────────────────────────────────────────────
export async function searchCaregivers(location: string, specialty?: string, page = 1, limit = 20, query?: string) {
  const params = new URLSearchParams({ location, page: String(page), limit: String(limit) });
  if (specialty) params.append('specialty', specialty);
  if (query?.trim()) params.append('q', query.trim());
  return request<{ caregivers?: unknown[]; docs?: unknown[] }>(`/search-caregivers?${params}`);
}

export async function getPublicCaregiverProfile(id: number | string) {
  return request<{ success: boolean; profile?: Record<string, unknown>; error?: string }>(
    `/public-profile?id=${encodeURIComponent(String(id))}`
  );
}

// ── Bookings ──────────────────────────────────────────────────────────
export async function bookInterview(payload: {
  caregiverId: number | string;
  clientEmail: string;
  careNeeds: string;
  preferredDate: string;
  preferredTime: string;
  interviewType: string;
  notes: string;
  durationMinutes?: number;
  clientToken?: string;
}) {
  // AUTHZ-05: include session token so backend can authenticate the request
  return request('/book-interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => ({})); // Non-fatal — confirmation still shows
}

export async function getInterviewSlots(caregiverId: number | string, date: string, durationMinutes = 30) {
  const params = new URLSearchParams({
    caregiverId: String(caregiverId),
    date,
    duration: String(durationMinutes),
  });
  return request<{
    success: boolean;
    slots: { value: string; label: string; startTime: string; endTime: string; durationMinutes: number }[];
  }>(`/interview-slots?${params}`);
}

export async function createInterviewBooking(payload: {
  caregiverId: number | string;
  clientEmail: string;
  careNeeds: string;
  preferredDate: string;
  preferredTime: string;
  interviewType: string;
  notes: string;
  durationMinutes?: number;
  clientToken?: string;
}) {
  // AUTHZ-05: include session token so backend can authenticate the request
  return request('/book-interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function hireCaregiver(token: string, caregiverId: number | string, bookingId: number | null) {
  return request<{ success: boolean; caregiverName?: string }>('/hire-caregiver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, caregiverId, bookingId }),
  });
}

export async function getMyBookings(email: string, clientToken?: string) {
  // SECURITY (P18): token in Authorization header — not in URL (avoids browser history / log leakage)
  const tok = clientToken || email; // fallback to email if no token (legacy)
  return request<{ bookings: unknown[] }>('/my-bookings', {
    headers: { 'Authorization': `Bearer ${tok}` },
  });
}

export async function cancelBooking(bookingId: number, clientEmail: string, clientToken?: string) {
  // AUTHZ-04: send session token so backend can verify ownership
  return request<{ success: boolean; error?: string }>('/cancel-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, clientEmail, clientToken }),
  });
}

// ── Team ──────────────────────────────────────────────────────────────
export async function getMyTeam(token: string) {
  // SECURITY (P18): token in Authorization header
  return request<{ success: boolean; hired: unknown[]; active: unknown[]; past: unknown[] }>(
    '/client-team',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
}

export async function removeFromTeam(token: string, caregiverId: number | string) {
  return request<{ success: boolean }>('/remove-from-team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, caregiverId }),
  });
}

// ── Onsite tracker ────────────────────────────────────────────────────
export async function getOnsiteCaregiver(clientToken: string) {
  // SECURITY (P18): token in Authorization header
  return request<{ active: boolean; caregiver_name?: string; start_time?: string }>(
    '/client-onsite-caregiver',
    { headers: { 'Authorization': `Bearer ${clientToken}` } }
  );
}

// ── Live status (team check-in) ───────────────────────────────────────
export async function getTeamLiveStatus(clientToken: string) {
  // SECURITY (P18): token in Authorization header
  return request<{ success: boolean; statuses: unknown[] }>(
    '/team-live-status',
    { headers: { 'Authorization': `Bearer ${clientToken}` } }
  );
}

// ── Care schedule ─────────────────────────────────────────────────────
export async function getCareSchedule(clientToken: string, caregiverEmail: string) {
  // SECURITY (P18): token in Authorization header; caregiverEmail stays in URL (not sensitive)
  return request<{ success: boolean; schedule?: unknown }>(
    `/care-schedule?caregiverEmail=${encodeURIComponent(caregiverEmail)}`,
    { headers: { 'Authorization': `Bearer ${clientToken}` } }
  );
}

export async function saveCareSchedule(payload: {
  clientToken: string;
  caregiverEmail: string;
  days: string[];
  startTime: string;
  endTime: string;
  careType: string;
  notes: string;
  isRecurring: boolean;
}) {
  return request<{ success: boolean }>('/care-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Shortlist / preferences ────────────────────────────────────────────
export async function syncShortlist(clientToken: string, shortlistIds: (number | string)[]) {
  // SECURITY (P18): token in Authorization header
  return fetch(`${API}/client-shortlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
    body: JSON.stringify({ shortlist: shortlistIds }),
  }).catch(() => undefined);
}

export async function savePreferences(clientToken: string, location: string, careTypes: string[]) {
  // SECURITY (P18): token in Authorization header
  return fetch(`${API}/client-preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
    body: JSON.stringify({ location, careTypes }),
  }).catch(() => undefined);
}

// ── Subscription ──────────────────────────────────────────────────────
export async function checkSubscription(email: string) {
  return request<{ subscribed: boolean; plan?: string }>(
    `/check-subscription?email=${encodeURIComponent(email)}`
  ).catch(() => ({ subscribed: false }));
}

export async function createSubscriptionCheckout(email: string, plan: string) {
  return request<{ url?: string; error?: string }>('/create-subscription-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, plan }),
  });
}

export async function removeBookingFromView(bookingId: number) {
  return request<{ success: boolean; error?: string }>('/client-bookings/hide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, clientToken: getToken(), reason: 'user_removed' }),
  });
}

export async function createCaregiverAccessCheckout(
  email: string,
  plan: string,
  caregiverId?: number | string,
  // Phase 26A: pass action context so backend can embed in success_url
  careAction?: string,
  returnContext?: string,
) {
  return request<{ url?: string; error?: string }>('/create-subscription-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, plan, caregiverId,
      careAction: careAction || undefined,
      returnContext: returnContext || 'caregiver_unlock',
    }),
  });
}

// ── Certifications (for client viewing with subscription) ─────────────
export async function confirmClientSubscription(email: string, plan: string, sessionId?: string) {
  return request<{ success: boolean; plan?: string; error?: string }>('/confirm-client-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, plan, sessionId }),
  });
}

export async function createClientBillingPortal(email: string) {
  return request<{ success?: boolean; url?: string; error?: string }>('/create-client-billing-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function getCaregiverDocs(email: string, clientToken: string) {
  // SECURITY (P18): token in Authorization header; email in URL (not secret)
  return request<{ success: boolean; subscribed: boolean; count: number; documents: { name: string }[] }>(
    `/caregiver-profile-docs?email=${encodeURIComponent(email)}`,
    { headers: { 'Authorization': `Bearer ${clientToken}` } }
  );
}

// ── Hire Agreements ───────────────────────────────────────────────────
export async function createHireAgreement(payload: {
  clientToken: string;
  caregiverId: number | string;
  careTypes: string[];
  startDate?: string | null;
  scheduleNotes?: string | null;
  scheduleDays?: string[];
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleRecurring?: boolean;
  negotiatedRate?: number;
  hoursPerWeek?: string;
  clientSignature?: string;
}) {
  return request<{ success: boolean; agreementToken?: string; error?: string }>('/create-hire-agreement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getHireAgreement(agreementToken: string) {
  return request<{ success: boolean; agreement?: unknown }>(`/hire-agreement?token=${encodeURIComponent(agreementToken)}`);
}

// ── Geolocation reverse lookup ────────────────────────────────────────
export async function reverseGeocode(lat: number, lon: number) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
  return res.json() as Promise<{ address?: { city?: string; town?: string; village?: string; state?: string; state_code?: string } }>;
}
