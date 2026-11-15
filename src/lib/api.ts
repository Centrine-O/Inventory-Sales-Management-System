const TOKEN_KEY = "stockflow.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
};

/** Called when the server says the session is no longer valid. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the API is running.");
  }
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && path !== "/auth/login") onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return res;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    return (await request(path)).json();
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    return (await request(path, { method: "POST", body: JSON.stringify(body ?? {}) })).json();
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    return (await request(path, { method: "PUT", body: JSON.stringify(body) })).json();
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    return (await request(path, { method: "PATCH", body: JSON.stringify(body) })).json();
  },
  async delete<T = void>(path: string): Promise<T> {
    const res = await request(path, { method: "DELETE" });
    return res.status === 204 ? (undefined as T) : res.json();
  },
  /** Fetches an authenticated file and triggers a browser download. */
  async download(path: string, filename: string) {
    const blob = await (await request(path)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function qs(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : "";
}
