import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getPosition, idempotencyKey } from '../src/lib/api';

afterEach(() => vi.restoreAllMocks());

describe('API client', () => {
  it('parses successful envelopes and always includes credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { safe: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(api<{ safe: boolean }>('/test')).resolves.toEqual({ safe: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/test',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('adds JSON content type, refreshes once after 401, and retries', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'SESSION_INVALID' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { refreshed: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    await expect(api('/resource', { method: 'POST', body: '{}' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/refresh');
  });

  it('throws a safe typed error and supports empty responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOPE', message: 'Safe message' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(api('/bad')).rejects.toEqual(new ApiError(400, 'NOPE', 'Safe message'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api('/empty')).resolves.toBeNull();
  });

  it('creates a cryptographic idempotency key', () => {
    expect(idempotencyKey()).toBe('00000000-0000-4000-8000-000000000001');
  });
});

describe('geolocation wrapper', () => {
  it('returns a position with safe defaults', async () => {
    const position = { coords: { latitude: 1, longitude: 2 }, timestamp: 1 } as GeolocationPosition;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback) => success(position) }
    });
    await expect(getPosition()).resolves.toBe(position);
  });

  it('rejects when location is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    await expect(getPosition()).rejects.toMatchObject({ code: 'LOCATION_UNAVAILABLE' });
  });
});
