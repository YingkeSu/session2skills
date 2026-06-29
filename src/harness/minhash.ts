/**
 * MinHash + LSH primitives for fuzzy near-duplicate detection.
 *
 * Pure TypeScript (no external runtime dependency). Used by the evidence
 * noise filter (`evidence-index.ts`) to collapse cross-session skill
 * echoes that survived the structural + density gates.
 *
 * Algorithm:
 *   1. Shingle the text into k-word grams.
 *   2. Compute a MinHash signature: for each of `permutations` independent
 *      hash functions, keep the minimum hashed shingle in the set.
 *   3. The fraction of matching signature positions approximates the
 *      Jaccard similarity of the underlying shingle sets.
 *   4. LSH banding: split the signature into `bands` rows of `rows` values
 *      each; items sharing any band key are candidate near-duplicates.
 */

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit string hash (FNV-1a variant). Seeded so the same
 * input + seed always yields the same uint32 — MinHash signatures are
 * reproducible across runs (the filter is a pure function).
 */
export function hashString(input: string, seed: number): number {
  // FNV-1a offset basis and prime (32-bit).
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), kept in uint32 space.
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Shingling + Jaccard
// ---------------------------------------------------------------------------

/**
 * Produce the set of k-character n-gram shingles for `text`. Lowercases and
 * collapses runs of whitespace first so cosmetic differences do not split
 * shingles. Character n-grams (rather than word-grams) give near-duplicate
 * detection enough resolution to work on short evidence excerpts: a few
 * word swaps move the Jaccard of word-grams a lot, but only nudge the
 * Jaccard of overlapping character windows.
 */
export function shingles(text: string, k: number): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length < k) return new Set<string>();

  const out = new Set<string>();
  for (let i = 0; i <= normalized.length - k; i++) {
    out.add(normalized.slice(i, i + k));
  }
  return out;
}

/** Exact Jaccard similarity |A ∩ B| / |A ∪ B|. Returns 0 for two empty sets. */
export function computeJaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// MinHash signatures
// ---------------------------------------------------------------------------

/**
 * Compute the MinHash signature of a shingle set.
 *
 * Each of the `permutations` signature positions uses an independent seeded
 * hash; we keep the minimum hashed value across the set. The signature is
 * deterministic for a given `seed`.
 */
export function minHashSignature(
  shingleSet: Set<string>,
  permutations: number,
  seed: number,
): Array<number> {
  const shinglesList = [...shingleSet];
  const signature: Array<number> = new Array(permutations);

  for (let p = 0; p < permutations; p++) {
    let min = Infinity;
    // Distinct seed per permutation to get independent hash functions.
    const permSeed = seed * 0x9e3779b1 + p * 0x85ebca6b;
    for (const shingle of shinglesList) {
      const h = hashString(shingle, permSeed);
      if (h < min) min = h;
    }
    // Empty set -> use the permutation seed itself so all empty sets share a
    // signature (they are "identical" trivially, and never exceed threshold
    // against non-empty sets because their single position matches at most
    // by accident, which is acceptable for LSH candidate generation).
    signature[p] = min === Infinity ? (permSeed >>> 0) : min;
  }

  return signature;
}

/**
 * Estimate Jaccard similarity from two MinHash signatures of equal length:
 * the fraction of positions where the signatures agree.
 */
export function estimateJaccardFromSignatures(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / a.length;
}

// ---------------------------------------------------------------------------
// LSH banding
// ---------------------------------------------------------------------------

/**
 * Split a signature into `bands` band keys (each covering `rows` signature
 * positions). Items that share any band key are LSH candidate pairs. The
 * returned array has exactly `bands` entries (one band key per band).
 */
export function lshBuckets(
  signature: ReadonlyArray<number>,
  bands: number,
  rows: number,
): Array<string> {
  const keys: Array<string> = [];
  for (let b = 0; b < bands; b++) {
    const slice = signature.slice(b * rows, b * rows + rows);
    keys.push(`${b}:${slice.join(",")}`);
  }
  return keys;
}
