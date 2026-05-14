// ══════════════════════════════════════════
// Carehia API utility — all fetch calls
// ══════════════════════════════════════════

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
export async function searchCaregivers(location: string, specialty?: string, page = 1, limit = 20) {
  const params = new URLSearchParams({ location, page: String(page), limit: String(limit) });
  if (specialty) params.append('specialty', specialty);
  return request<{ caregivers?: unknown[]; docs?: unknown[] }>(`/search-caregivers?${params}`);
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
}) {
  return request('/book-interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => ({})); // Non-fatal — confirmation still shows
}

export async function hireCaregiver(token: string, caregiverId: number | string, bookingId: number | null) {
  return request<{ success: boolean; caregiverName?: string }>('/hire-caregiver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, caregiverId, bookingId }),
  });
}

export async function getMyBookings(email: string) {
  return request<{ bookings: unknown[] }>(`/my-bookings?email=${encodeURIComponent(email)}`);
}

export async function cancelBooking(bookingId: number, clientEmail: string) {
  return request<{ success: boolean; error?: string }>('/cancel-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, clientEmail }),
  });
}

// ── Team ──────────────────────────────────────────────────────────────
export async function getMyTeam(token: string) {
  return request<{ success: boolean; hired: unknown[]; active: unknown[]; past: unknown[] }>(
    `/client-team?token=${encodeURIComponent(token)}`
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
  return request<{ active: boolean; caregiver_name?: string; start_time?: string }>(
    `/client-onsite-caregiver?clientToken=${encodeURIComponent(clientToken)}`
  );
}

// ── Live status (team check-in) ───────────────────────────────────────
export async function getTeamLiveStatus(clientToken: string) {
  return request<{ success: boolean; statuses: unknown[] }>(
    `/team-live-status?clientToken=${encodeURIComponent(clientToken)}`
  );
}

// ── Care schedule ─────────────────────────────────────────────────────
export async function getCareSchedule(clientToken: string, caregiverEmail: string) {
  return request<{ success: boolean; schedule?: unknown }>(
    `/care-schedule?clientToken=${encodeURIComponent(clientToken)}&caregiverEmail=${encodeURIComponent(caregiverEmail)}`
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
  return fetch(`${API}/client-shortlist?clientToken=${clientToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shortlist: shortlistIds }),
  }).catch(() => undefined);
}

export async function savePreferences(clientToken: string, location: string, careTypes: string[]) {
  return fetch(`${API}/client-preferences?clientToken=${clientToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// ── Certifications (for client viewing with subscription) ─────────────
export async function getCaregiverDocs(email: string, clientToken: string) {
  return request<{ success: boolean; subscribed: boolean; count: number; documents: { name: string }[] }>(
    `/caregiver-profile-docs?email=${encodeURIComponent(email)}&clientToken=${clientToken}`
  );
}

// ── Hire Agreements ───────────────────────────────────────────────────
export async function createHireAgreement(payload: {
  clientToken: string;
  caregiverId: number | string;
  careTypes: string[];
  startDate?: string | null;
  scheduleNotes?: string | null;
  clientSignature: string;
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
