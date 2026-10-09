import { expect, it } from 'vitest';
import { linkParts } from '../src/lib/links';
import { formatMoney, supportedCurrency } from '../src/lib/currency';
it('only recognizes web links and preserves surrounding text', () => {
  const text =
    'Read https://example.com. Or www.example.org! javascript:alert(1)';
  const parts = linkParts(text);
  expect(parts.map((part) => part.text).join('')).toBe(text);
  expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
    'https://example.com/',
    'https://www.example.org/',
  ]);
});
it('formats whole units without converting values and rejects unknown currency settings', () => {
  expect(formatMoney(1250000, 'IDR')).toMatch(/1\.250\.000/);
  expect(formatMoney(1250000, 'USD')).toBe('$1,250,000');
  expect(supportedCurrency('__proto__')).toBe('IDR');
});
