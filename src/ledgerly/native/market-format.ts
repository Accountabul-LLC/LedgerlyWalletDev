/**
 * USD labels for phone market rows. Display only; this never prices a payment.
 * The two formatters are built once. Their options match the previous per-call
 * formatters, so the same number still renders the same string.
 */
const smallUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
});

const largeUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export function marketPrice(value: string | null): string {
  if (value === null) return '—';
  const price = Number(value);
  if (!Number.isFinite(price)) return '—';
  if (price > 0 && price < 0.000001) return `$${price.toPrecision(3)}`;
  return (price < 1 ? smallUsd : largeUsd).format(price);
}
