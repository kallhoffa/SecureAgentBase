import { describe, it, expect, beforeAll } from 'vitest';
import { encryptData, decryptData } from '../framework/infra-setup/crypto';

const PASSPHRASE = 'correct-horse-battery-staple';

describe('crypto', () => {
  describe('encryptData / decryptData round-trip', () => {
    it('round-trips an object with a passphrase', async () => {
      const original = { projectId: 'agentbase-staging', apiKey: 'AIza...' };
      const encrypted = await encryptData(original, PASSPHRASE);

      expect(typeof encrypted).toBe('string');
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('salt');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('data');

      const decrypted = await decryptData(encrypted, PASSPHRASE);
      expect(decrypted).toEqual(original);
    });

    it('round-trips a string value', async () => {
      const encrypted = await encryptData('hello world', PASSPHRASE);
      const decrypted = await decryptData(encrypted, PASSPHRASE);
      expect(decrypted).toBe('hello world');
    });

    it('round-trips null', async () => {
      const encrypted = await encryptData(null, PASSPHRASE);
      const decrypted = await decryptData(encrypted, PASSPHRASE);
      expect(decrypted).toBeNull();
    });

    it('round-trips an array', async () => {
      const original = [1, 'two', { three: 3 }];
      const encrypted = await encryptData(original, PASSPHRASE);
      const decrypted = await decryptData(encrypted, PASSPHRASE);
      expect(decrypted).toEqual(original);
    });

    it('produces a different ciphertext for the same input (random salt+iv)', async () => {
      const data = { a: 1 };
      const a = await encryptData(data, PASSPHRASE);
      const b = await encryptData(data, PASSPHRASE);
      expect(a).not.toBe(b);
      expect(await decryptData(a, PASSPHRASE)).toEqual(await decryptData(b, PASSPHRASE));
    });
  });

  describe('empty passphrase fallback', () => {
    it('encryptData with empty passphrase returns plain JSON', async () => {
      const original = { foo: 'bar' };
      const result = await encryptData(original, '');
      expect(JSON.parse(result)).toEqual(original);
    });

    it('decryptData with empty passphrase parses plain JSON', async () => {
      const original = JSON.stringify({ foo: 'bar' });
      const result = await decryptData(original, '');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('round-trips through the empty-passphrase path', async () => {
      const original = { foo: 'bar', n: 42 };
      const encrypted = await encryptData(original, '');
      const decrypted = await decryptData(encrypted, '');
      expect(decrypted).toEqual(original);
    });
  });

  describe('wrong passphrase', () => {
    it('decryptData with wrong passphrase throws', async () => {
      const encrypted = await encryptData({ secret: 'value' }, PASSPHRASE);
      await expect(decryptData(encrypted, 'wrong-passphrase')).rejects.toThrow(
        /passphrase|corrupted/i
      );
    });

    it('decryptData on corrupted data throws', async () => {
      const junk = JSON.stringify({ salt: '!!!', iv: '???', data: '###' });
      await expect(decryptData(junk, PASSPHRASE)).rejects.toThrow();
    });

    it('throwing rejects rather than returning undefined', async () => {
      const encrypted = await encryptData({ secret: 'value' }, PASSPHRASE);
      const result = decryptData(encrypted, 'wrong');
      await expect(result).rejects.toBeInstanceOf(Error);
    });
  });
});