import { vi } from 'vitest';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001') }
});
