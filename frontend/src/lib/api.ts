const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function parse(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json') ? response.json() : null;
}

export async function api<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
  if (response.status === 401 && allowRefresh && path !== '/auth/refresh' && path !== '/auth/session') {
    const refreshed = await fetch(apiUrl('/auth/refresh'), { method: 'POST', credentials: 'include' });
    if (refreshed.ok) return api<T>(path, options, false);
  }
  const body = (await parse(response)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? 'The request failed'
    );
  }
  return (body?.data ?? body) as T;
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}

export function getPosition(options: PositionOptions = {}): Promise<GeolocationPosition> {
  if (!navigator.geolocation)
    return Promise.reject(new ApiError(0, 'LOCATION_UNAVAILABLE', 'Location is not supported'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 15_000,
      ...options
    });
  });
}
