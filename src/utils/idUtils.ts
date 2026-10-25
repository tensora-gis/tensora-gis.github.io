/**
 * Helper to generate guaranteed non-colliding sequential IDs even across delete/add operations.
 * Example: getNextId('J-', ['J-1', 'J-2']) -> 'J-3'
 */
export function getNextId(prefix: string, existingIds: string[]): string {
  let maxNum = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const numStr = id.slice(prefix.length);
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return `${prefix}${maxNum + 1}`;
}
