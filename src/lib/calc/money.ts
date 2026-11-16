/** Round to cents, half away from zero, tolerant of binary float noise (e.g. 1.005). */
export function roundMoney(x: number): number {
  if (!Number.isFinite(x)) return x;
  const s = Math.sign(x) || 1;
  return (s * Math.round(Math.abs(x) * 100 + 1e-7)) / 100 || 0;
}

/** Round to a fixed number of decimals (half away from zero). */
export function roundTo(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** decimals;
  const s = Math.sign(x) || 1;
  return (s * Math.round(Math.abs(x) * f + 1e-7)) / f || 0;
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
