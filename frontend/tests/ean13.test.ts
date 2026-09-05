import { describe, expect, it } from 'vitest';
import { checkDigit, ean13FromProductId, ean13Modules, isValidEan13 } from '@/lib/ean13';

/**
 * A barcode nobody can scan is worse than none: the whole scan demo would
 * fall through to the manual-confirm path and look like the feature is
 * missing. So the checksum is pinned against published vectors, and the bar
 * pattern against the structure every scanner expects.
 */
describe('checkDigit', () => {
  it.each([
    ['400638133393', '1'], // the EAN-13 article's worked example
    ['590123412345', '7'],
    ['978030640615', '7'], // an ISBN-13 is an EAN-13
    ['200000000006', '0'],
  ])('%s -> %s', (twelve, expected) => {
    expect(checkDigit(twelve)).toBe(expected);
  });

  it('refuses anything but exactly 12 digits', () => {
    expect(() => checkDigit('12345678901')).toThrow();
    expect(() => checkDigit('1234567890123')).toThrow();
    expect(() => checkDigit('12345678901a')).toThrow();
  });
});

describe('isValidEan13', () => {
  it('accepts a correct code and rejects a single-digit error', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('4006381333913')).toBe(false);
  });

  it('rejects the wrong length, letters, and non-strings', () => {
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339310')).toBe(false);
    expect(isValidEan13('40063813339a1')).toBe(false);
    expect(isValidEan13(4006381333931)).toBe(false);
    expect(isValidEan13(null)).toBe(false);
  });
});

describe('ean13FromProductId', () => {
  it('is 200 + the id padded to nine digits + the check digit', () => {
    expect(ean13FromProductId(6)).toBe('2000000000060');
    expect(ean13FromProductId(123456789)).toBe('200123456789' + checkDigit('200123456789'));
  });

  it('is deterministic and always valid', () => {
    for (const id of [1, 2, 3, 42, 1000, 999_999_999]) {
      const code = ean13FromProductId(id);
      expect(code).toBe(ean13FromProductId(id));
      expect(isValidEan13(code)).toBe(true);
      expect(code.startsWith('200')).toBe(true);
    }
  });

  it('refuses ids it cannot encode', () => {
    expect(() => ean13FromProductId(0)).toThrow();
    expect(() => ean13FromProductId(-1)).toThrow();
    expect(() => ean13FromProductId(1.5)).toThrow();
    expect(() => ean13FromProductId(1_000_000_000)).toThrow();
  });
});

describe('ean13Modules', () => {
  const modules = ean13Modules('4006381333931')!;

  it('is 95 modules with the guard bars where every scanner expects them', () => {
    expect(modules).toHaveLength(95);
    expect(modules.slice(0, 3)).toBe('101');
    expect(modules.slice(45, 50)).toBe('01010');
    expect(modules.slice(92)).toBe('101');
    expect(modules).toMatch(/^[01]+$/);
  });

  it('encodes the left half with the parity the first digit dictates', () => {
    // First digit 4 -> LGLLGG. Second digit 0: L[0]=0001101. Third digit 0: G[0]=0100111.
    expect(modules.slice(3, 10)).toBe('0001101');
    expect(modules.slice(10, 17)).toBe('0100111');
  });

  it('encodes the right half with R patterns', () => {
    // Digits 8..13 of 4006381333931 are 3,3,3,9,3,1. R[3]=1000010, R[1]=1100110.
    expect(modules.slice(50, 57)).toBe('1000010');
    expect(modules.slice(85, 92)).toBe('1100110');
  });

  it('is null for anything that is not a valid code', () => {
    expect(ean13Modules('4006381333932')).toBeNull();
    expect(ean13Modules('')).toBeNull();
    expect(ean13Modules(undefined)).toBeNull();
  });
});
