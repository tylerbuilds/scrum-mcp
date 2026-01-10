// API configuration for SCRUM backend
// In development, Vite proxies /api to localhost:4177
// In production, adjust as needed
export const API_URL = '';

export async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.ok === false) {
    throw new Error(json.error || 'Unknown API error');
  }
  return json.data ?? json;
}
