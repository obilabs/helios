/**
 * Uniform random integer in [0, max) from the browser's cryptographic RNG.
 * Rejection sampling avoids the bias of `value % max`.
 */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new RangeError('max must be an integer between 1 and 2^32');
  }
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}
