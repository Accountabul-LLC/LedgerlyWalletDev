import type { ScannedPayment } from './format';

let pending: ScannedPayment | null = null;

export function stashScan(value: ScannedPayment): void {
  pending = value;
}

export function takeScan(): ScannedPayment | null {
  const value = pending;
  pending = null;
  return value;
}
