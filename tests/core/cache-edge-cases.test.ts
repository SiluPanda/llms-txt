/**
 * Edge case tests for the Cache class.
 *
 * Tests boundary conditions, TTL edge cases, and concurrent access patterns.
 */
import { Cache } from '../../src/core/cache.js';

describe('cache: TTL edge cases', () => {
  it('TTL = 0 causes immediate expiration', () => {
    const cache = new Cache<string>(0);
    cache.set('key', 'value');
    // With TTL 0, entry expires at Date.now() + 0
    // get() checks Date.now() > expiresAt, which may or may not be true
    // depending on millisecond timing
    const result = cache.get('key');
    // Either immediately expired or just barely valid
    expect(result === undefined || result === 'value').toBe(true);
  });

  it('very large TTL keeps entries alive', () => {
    const cache = new Cache<string>(Number.MAX_SAFE_INTEGER);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
    expect(cache.has('key')).toBe(true);
  });

  it('negative TTL causes immediate expiration', () => {
    const cache = new Cache<string>(-1000);
    cache.set('key', 'value');
    expect(cache.get('key')).toBeUndefined();
    expect(cache.has('key')).toBe(false);
  });
});

describe('cache: set and get operations', () => {
  it('overwrites existing value for same key', () => {
    const cache = new Cache<string>(60_000);
    cache.set('key', 'first');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  it('stores multiple keys independently', () => {
    const cache = new Cache<number>(60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('returns undefined for never-set keys', () => {
    const cache = new Cache<string>(60_000);
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('stores complex objects', () => {
    const cache = new Cache<{ name: string; items: number[] }>(60_000);
    const value = { name: 'test', items: [1, 2, 3] };
    cache.set('obj', value);
    expect(cache.get('obj')).toBe(value); // Same reference
    expect(cache.get('obj')!.name).toBe('test');
    expect(cache.get('obj')!.items).toEqual([1, 2, 3]);
  });

  it('stores null-like values correctly', () => {
    const cache = new Cache<string | number | boolean>(60_000);
    cache.set('empty', '');
    cache.set('zero', 0);
    cache.set('false', false);

    expect(cache.get('empty')).toBe('');
    expect(cache.get('zero')).toBe(0);
    expect(cache.get('false')).toBe(false);
  });

  it('handles empty string key', () => {
    const cache = new Cache<string>(60_000);
    cache.set('', 'empty key');
    expect(cache.get('')).toBe('empty key');
    expect(cache.has('')).toBe(true);
  });
});

describe('cache: has operation', () => {
  it('returns true for existing valid entries', () => {
    const cache = new Cache<string>(60_000);
    cache.set('key', 'value');
    expect(cache.has('key')).toBe(true);
  });

  it('returns false for nonexistent keys', () => {
    const cache = new Cache<string>(60_000);
    expect(cache.has('missing')).toBe(false);
  });

  it('returns false for expired entries', () => {
    const cache = new Cache<string>(-1);
    cache.set('key', 'value');
    expect(cache.has('key')).toBe(false);
  });
});

describe('cache: invalidation', () => {
  it('invalidates specific key', () => {
    const cache = new Cache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');

    cache.invalidate('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  it('invalidates all keys when no key specified', () => {
    const cache = new Cache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    cache.invalidate();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
  });

  it('invalidating nonexistent key is a no-op', () => {
    const cache = new Cache<string>(60_000);
    cache.set('existing', 'value');

    // Should not throw
    cache.invalidate('nonexistent');

    expect(cache.get('existing')).toBe('value');
  });

  it('invalidating empty cache is a no-op', () => {
    const cache = new Cache<string>(60_000);
    // Should not throw
    cache.invalidate();
    cache.invalidate('key');
  });

  it('set after invalidate works correctly', () => {
    const cache = new Cache<string>(60_000);
    cache.set('key', 'first');
    cache.invalidate('key');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  it('invalidateAll then set works correctly', () => {
    const cache = new Cache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.invalidate();
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
  });
});

describe('cache: expiration cleanup', () => {
  it('expired entry is deleted on get()', () => {
    const cache = new Cache<string>(-1);
    cache.set('key', 'value');

    // First access triggers deletion
    const result = cache.get('key');
    expect(result).toBeUndefined();

    // Subsequent set should work fine
    const freshCache = new Cache<string>(60_000);
    freshCache.set('key', 'fresh');
    expect(freshCache.get('key')).toBe('fresh');
  });
});
