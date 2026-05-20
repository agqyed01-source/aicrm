export const getToken = () => localStorage.getItem("token");
export const setToken = (token: string) => localStorage.setItem("token", token);
export const removeToken = () => localStorage.removeItem("token");

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
  }
  
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    const text = await response.text();
    console.error(`API Error: ${url} returned HTML. Body snippet: `, text.substring(0, 200));
    throw new Error(`API Endpoint ${url} returned HTML instead of JSON. Expected API response.`);
  }

  return response;
}
