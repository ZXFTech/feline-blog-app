import { describe, expect, it } from 'vitest';

import {
  codePointLength,
  parseDateOnly,
  parsePositiveInt,
  parseString,
  utf8ByteLength,
} from './validation';

describe('server validation', () => {
  it('AC-7 trims ordinary fields while preserving body content', () => {
    expect(parseString('  cat  ', { label: 'name', max: 10 })).toBe('cat');
    expect(parseString('  body  ', { label: 'body', max: 10, trim: false })).toBe('  body  ');
    expect(parseString('   ', { label: 'name', max: 10 })).toBeNull();
  });

  it('AC-8 counts Unicode code points instead of UTF-16 units', () => {
    expect(codePointLength('🐈🐈')).toBe(2);
    expect(parseString('🐈🐈', { label: 'name', max: 2 })).toBe('🐈🐈');
    expect(parseString('🐈🐈🐈', { label: 'name', max: 2 })).toBeNull();
  });

  it('AC-7 accepts only positive safe integer identifiers', () => {
    expect(parsePositiveInt('12')).toBe(12);
    for (const value of [0, -1, 1.5, 'cat', Number.MAX_SAFE_INTEGER + 1]) {
      expect(parsePositiveInt(value)).toBeNull();
    }
  });

  it('AC-7 rejects malformed and rolled calendar dates', () => {
    expect(parseDateOnly('2024-02-29')).toEqual(new Date('2024-02-29T00:00:00.000Z'));
    for (const value of ['2023-02-29', '2024-02-30', '2024-2-01', '2024-01-01T00:00:00Z', null]) {
      expect(parseDateOnly(value)).toBeNull();
    }
  });

  it('AC-8 measures database limits in UTF-8 bytes', () => {
    expect(utf8ByteLength('cat')).toBe(3);
    expect(utf8ByteLength('猫')).toBe(3);
    expect(utf8ByteLength('🐈')).toBe(4);
  });
});
