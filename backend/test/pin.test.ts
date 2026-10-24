import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../src/security/pin.js';

describe('safety PIN hashing', () => {
  it('uses a random salt and verifies without storing the PIN', async () => {
    const first = await hashPin('1234');
    const second = await hashPin('1234');
    expect(first.hash).not.toBe(second.hash);
    expect(first.hash).not.toContain('1234');
    await expect(verifyPin('1234', first.salt, first.hash)).resolves.toBe(true);
    await expect(verifyPin('9876', first.salt, first.hash)).resolves.toBe(false);
  });
});
