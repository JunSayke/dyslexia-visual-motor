/**
 * FeatureFingerprint
 *
 * A normalized, reference-agnostic descriptor of a set of strokes.
 * Extracted automatically by FeatureExtractor — no per-character config needed.
 * Rules compare attempt fingerprints against reference fingerprints.
 */

export interface DensityGrid {
  /** Normalized ink-density per cell (values sum to 1.0). Row-major order. */
  values: number[];
  /** Grid side length. A value of 3 means a 3×3 = 9-cell grid. */
  resolution: number;
}

export interface DirectionHistogram {
  /**
   * Normalized movement-direction distribution across 8 cardinal buckets:
   * [E, NE, N, NW, W, SW, S, SE] (0 = east, rotating counter-clockwise).
   * Values sum to 1.0.
   */
  buckets: number[];
}

export interface CurvatureProfile {
  /** Mean absolute angle-change per step (radians). High = curvy shape. */
  mean: number;
  /** Std-dev of curvature — high variance = irregular / tremor-prone. */
  std: number;
  /**
   * Count of abrupt direction reversals (angle change > 90°).
   * Used for tremor and kinematic reversal detection.
   */
  reversalCount: number;
}

export interface FeatureFingerprint {
  /** Bounding-box width / height. Captured from the reference drawing, not a lookup table. */
  proportions: {
    widthToHeightRatio: number;
  };

  /**
   * Spatial ink distribution — replaces hardcoded `expectedDensity` tables.
   * Any shape the user draws produces its own density map automatically.
   */
  densityGrid: DensityGrid;

  /**
   * Normalized movement-direction histogram.
   * Chirality and orientation emerge from this without per-glyph logic.
   */
  directionHistogram: DirectionHistogram;

  /**
   * Curvature statistics — feeds tremor / dysfluency detection.
   */
  curvature: CurvatureProfile;

  /** Number of discrete strokes (pen-lifts). Rules compare attempt vs reference. */
  strokeCount: number;

  /**
   * Winding score: positive = clockwise dominant, negative = counter-clockwise.
   * Sign comparison replaces hardcoded orientation rules (s vs z, b vs d, etc.).
   */
  windingScore: number;

  /**
   * Normalized X of the average terminal point: 0 = full left, 1 = full right.
   * Replaces hardcoded terminal-bias logic.
   */
  terminalBias: number;

  /** Sharp corners detected in the simplified stroke. Replaces per-char corner thresholds. */
  cornerCount: number;
  
}