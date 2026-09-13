/** Remove every trailing occurrence of `char` (linear time, no regex). */
export function trimTrailing(value: string, char: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === char) end--;
  return value.slice(0, end);
}
