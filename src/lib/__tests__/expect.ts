import assert from "node:assert/strict";

/** Minimal jest-style `expect` over node:assert, so tests stay readable without a native-binary test runner. */
export function expect<T>(actual: T) {
  const n = actual as unknown as number;
  return {
    toBe: (e: unknown) => assert.strictEqual(actual, e),
    toEqual: (e: unknown) => assert.deepStrictEqual(actual, e),
    toBeNull: () => assert.strictEqual(actual, null),
    toHaveLength: (len: number) => assert.strictEqual((actual as unknown as unknown[]).length, len),
    toBeGreaterThan: (e: number) => assert.ok(n > e, `${n} > ${e}`),
    toBeLessThan: (e: number) => assert.ok(n < e, `${n} < ${e}`),
    toBeCloseTo: (e: number, digits = 2) => assert.ok(Math.abs(n - e) < 10 ** -digits / 2, `${n} ≈ ${e}`),
    toMatchObject: (e: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(e)) assert.deepStrictEqual((actual as Record<string, unknown>)[k], v, k);
    },
  };
}
