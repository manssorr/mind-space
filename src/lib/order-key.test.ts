import { describe, expect, it } from "vitest"
import { orderKeyBetween } from "@/lib/order-key"

describe("orderKeyBetween", () => {
  it("returns an initial key for (null, null)", () => {
    const key = orderKeyBetween(null, null)
    expect(typeof key).toBe("string")
    expect(key.length).toBeGreaterThan(0)
  })

  it("returns a key after a for (a, null) - append case", () => {
    const a = orderKeyBetween(null, null)
    const key = orderKeyBetween(a, null)
    expect(key > a).toBe(true)
  })

  it("returns a key before b for (null, b) - prepend case", () => {
    const b = orderKeyBetween(null, null)
    const key = orderKeyBetween(null, b)
    expect(key < b).toBe(true)
  })

  it("returns a key strictly between a and b", () => {
    const a = "a"
    const b = "b"
    const key = orderKeyBetween(a, b)
    expect(key > a).toBe(true)
    expect(key < b).toBe(true)
  })

  it("handles tight adjacent bounds by extending key length", () => {
    const a = "a"
    const b = "b"
    let lo = a
    const hi = b
    for (let i = 0; i < 10; i++) {
      const mid = orderKeyBetween(lo, hi)
      expect(mid > lo).toBe(true)
      expect(mid < hi).toBe(true)
      lo = mid
    }
  })

  it("repeated appends stay reasonably short (append case reuses length)", () => {
    let key = orderKeyBetween(null, null)
    const keys = [key]
    for (let i = 0; i < 50; i++) {
      key = orderKeyBetween(key, null)
      keys.push(key)
    }
    // strictly increasing
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true)
    }
    // append case should not grow key length per append (bounded)
    expect(key.length).toBeLessThan(10)
  })

  it("repeated midpoints between two fixed keys always produce distinct ordered keys (loop 50x)", () => {
    const a = orderKeyBetween(null, null)
    const b = orderKeyBetween(a, null)
    let lo = a
    const seen = new Set<string>([a, b])
    for (let i = 0; i < 50; i++) {
      const mid = orderKeyBetween(lo, b)
      expect(mid > lo).toBe(true)
      expect(mid < b).toBe(true)
      expect(seen.has(mid)).toBe(false)
      seen.add(mid)
      lo = mid
    }
  })

  it("produces a stable sort order when building a list via sequential appends", () => {
    const keys: string[] = []
    let last: string | null = null
    for (let i = 0; i < 20; i++) {
      last = orderKeyBetween(last, null)
      keys.push(last)
    }
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
  })
})
