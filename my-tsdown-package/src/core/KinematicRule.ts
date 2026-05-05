import type { ReferenceProfile } from './ReferenceProfile';

export interface Point {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export type Stroke = Point[];

export interface KinematicResult {
  passed: boolean;
  /** Normalized 0–1 confidence score. 1 = perfect match. */
  score: number;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * KinematicRule
 *
 * All shape knowledge lives in the profile's auto-computed fingerprint,
 */
export interface KinematicRule {
  evaluate(strokes: Stroke[], reference: ReferenceProfile): KinematicResult;
}

// Re-export for consumer convenience
export type { ReferenceProfile } from './ReferenceProfile';
export type { FeatureFingerprint } from './FeatureFingerprint';
export { FeatureExtractor } from './FeatureExtractor';
export { createReferenceProfile } from './ReferenceProfile';