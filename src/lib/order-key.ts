const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
const BASE = ALPHABET.length
const MID = ALPHABET[Math.floor(BASE / 2)]

function charIndex(c: string): number {
  return ALPHABET.indexOf(c)
}

/**
 * Returns a key strictly between `a` and `b` (lexicographically), for
 * fractional-index ordering. Either bound may be null (start/end of list).
 * No external dependency: base-36 midpoint-string algorithm.
 */
export function orderKeyBetween(a: string | null, b: string | null): string {
  if (a === null && b === null) return MID
  if (a === null) return before(b!)
  if (b === null) return after(a)
  return between(a, b)
}

function after(a: string): string {
  let i = 0
  let result = ""
  while (i < a.length) {
    const digit = charIndex(a[i])
    if (digit < BASE - 1) {
      return result + ALPHABET[digit + 1]
    }
    result += a[i]
    i++
  }
  return result + MID
}

function before(b: string): string {
  let i = 0
  let result = ""
  while (i < b.length) {
    const digit = charIndex(b[i])
    if (digit > 0) {
      return result + ALPHABET[digit - 1]
    }
    result += "0"
    i++
  }
  return result + MID
}

function between(a: string, b: string): string {
  let i = 0
  let result = ""
  while (true) {
    const da = i < a.length ? charIndex(a[i]) : 0
    const db = i < b.length ? charIndex(b[i]) : BASE
    if (da === db) {
      result += a[i]
      i++
      continue
    }
    if (db - da > 1) {
      return result + ALPHABET[da + Math.floor((db - da) / 2)]
    }
    // adjacent digits: keep da, recurse into a's remaining suffix (or MID)
    result += ALPHABET[da]
    const aRest = i + 1 < a.length ? a.slice(i + 1) : null
    return result + (aRest !== null ? after(aRest) : MID)
  }
}
