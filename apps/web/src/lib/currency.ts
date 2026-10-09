import { writable } from 'svelte/store';
export const currencies = {
  IDR: 'id-ID',
  USD: 'en-US',
  EUR: 'de-DE',
  SGD: 'en-SG',
  MYR: 'ms-MY',
  JPY: 'ja-JP',
} as const;
export type Currency = keyof typeof currencies;
export const displayCurrency = writable<Currency>('IDR');
export const supportedCurrency = (value: unknown): Currency =>
  typeof value === 'string' && Object.hasOwn(currencies, value)
    ? (value as Currency)
    : 'IDR';
export function formatMoney(value: number, currency: Currency = 'IDR') {
  return new Intl.NumberFormat(currencies[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}
