import { Cache } from '../../src/core/cache.js';

describe('Cache', () => {
  it('stores and retrieves values', () => {
    const cache = new Cache<string>(60_000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    const cache = new Cache<string>(60_000);
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('returns undefined for expired entries', () => {
    const cache = new Cache<string>(1); // 1ms TTL
    cache.set('key', 'value');

    // Wait for expiration
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy wait for a few ms
    }

    expect(cache.get('key')).toBeUndefined();
  });

  it('cleans up expired entries on get', () => {
    const cache = new Cache<string>(1);
    cache.set('key', 'value');

    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy wait
    }

    // First get removes the entry
    expect(cache.get('key')).toBeUndefined();
    // has() should also return false
    expect(cache.has('key')).toBe(false);
  });

  it('invalidates specific keys', () => {
    const cache = new Cache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');

    cache.invalidate('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  it('invalidates all keys when called without argument', () => {
    const cache = new Cache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    cache.invalidate();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
  });

  describe('has()', () => {
    it('returns true for existing non-expired keys', () => {
      const cache = new Cache<string>(60_000);
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('returns false for missing keys', () => {
      const cache = new Cache<string>(60_000);
      expect(cache.has('missing')).toBe(false);
    });

    it('returns false for expired keys', () => {
      const cache = new Cache<string>(1);
      cache.set('key', 'value');

      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }

      expect(cache.has('key')).toBe(false);
    });
  });

  it('overwrites existing values', () => {
    const cache = new Cache<string>(60_000);
    cache.set('key', 'first');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  it('works with complex value types', () => {
    const cache = new Cache<{ name: string; count: number }>(60_000);
    const value = { name: 'test', count: 42 };
    cache.set('obj', value);
    expect(cache.get('obj')).toEqual(value);
  });
});
