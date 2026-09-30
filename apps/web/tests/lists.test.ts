import { expect, it } from 'vitest';
import { listItem, listPrefix, nestedPrefix } from '../src/lib/text/lists';
it('recognizes markers and alternates numbers and letters when nesting', () => {
  expect(listItem('not a list')).toBeNull();
  expect(listPrefix('letter', 1, 27)).toBe('  aa. ');
  expect(nestedPrefix(listItem('1. Parent')!, false, [])).toBe('  a. ');
  expect(nestedPrefix(listItem('a. Parent')!, false, [])).toBe('  1. ');
  expect(nestedPrefix(listItem('  a. Child')!, true, ['1. Parent'])).toBe(
    '2. ',
  );
  expect(nestedPrefix(listItem('• Bullet')!, false, [])).toBe('  • ');
});
