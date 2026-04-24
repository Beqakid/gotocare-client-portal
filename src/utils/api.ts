// @ts-nocheck

const API_BASE = 'https://gotocare-original.jjioji.workers.dev';

export async function apiCall(endpoint: string, method = 'GET', body?: any): Promise<any> {
  const headers: string[] = ['-H', 'Content-Type: application/json'];
  let cmd = `curl -s -X ${method} '${API_BASE}${endpoint}'`;
  
  if (body) {
    const escaped = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += ` -H 'Content-Type: application/json' -d '${escaped}'`;
  } else {
    cmd += ` -H 'Content-Type: application/json'`;
  }

  const result = await window.tasklet.runCommand(cmd);
  if (!result.stdout) throw new Error(result.stderr || 'No response from API');
  
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Invalid JSON response: ' + result.stdout.substring(0, 200));
  }
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
