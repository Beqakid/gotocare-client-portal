// @ts-nocheck

const API_BASE = 'https://gotocare-original.jjioji.workers.dev';

export async function apiCall(endpoint: string, method = 'GET', body?: any): Promise<any> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function clientLogin(email: string, accessCode: string): Promise<any> {
  return apiCall('/api/client-login', 'POST', { email, accessCode });
}

export async function getClientSchedule(clientId: number): Promise<any> {
  return apiCall(`/api/client-portal/schedule?clientId=${clientId}`);
}

export async function getClientCaregivers(clientId: number): Promise<any> {
  return apiCall(`/api/client-portal/caregivers?clientId=${clientId}`);
}

export async function getClientInvoices(clientId: number): Promise<any> {
  return apiCall(`/api/client-portal/invoices?clientId=${clientId}`);
}

export async function getClientProfile(clientId: number): Promise<any> {
  return apiCall(`/api/client-portal/profile?clientId=${clientId}`);
}

export async function updateClientProfile(clientId: number, data: any): Promise<any> {
  return apiCall(`/api/client-portal/profile?clientId=${clientId}`, 'POST', data);
}
