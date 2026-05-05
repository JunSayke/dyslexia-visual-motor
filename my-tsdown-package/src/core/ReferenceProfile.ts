import type { Stroke } from './KinematicRule';
import type { FeatureFingerprint } from './FeatureFingerprint';

/**
 * ReferenceProfile
 *
 * Everything the system knows about a reference shape. Created when a user
 * draws the reference.
 *
 * The consumer provides the strokes; FeatureExtractor provides the fingerprint.
 */
export interface ReferenceProfile {
  /** Unique identifier — e.g. a UUID or auto-incrementing id. */
  id: string;

  /** Human-readable label the consumer gives it: "lowercase b", "my 's'", "patient A spiral". */
  label: string;

  /**
   * The raw tracing points captured when the reference was drawn.
   * Stored so the reference can be replayed, edited, or re-analysed.
   * NOT a font glyph — it is actual pen motion.
   */
  referenceStrokes: Stroke[];

  /**
   * Auto-computed feature descriptor.
   * Rules read this instead of any hardcoded lookup table.
   */
  fingerprint: FeatureFingerprint;

  /** Unix timestamp (ms) when this reference was created. */
  createdAt: number;
}

/** Lightweight builder helpers — keep ReferenceProfile creation explicit. */
export function createReferenceProfile(
  label: string,
  referenceStrokes: Stroke[],
  fingerprint: FeatureFingerprint,
): ReferenceProfile {
  return {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    referenceStrokes,
    fingerprint,
    createdAt: Date.now(),
  };
}