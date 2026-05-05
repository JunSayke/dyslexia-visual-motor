// Core types and interfaces
export type { Point, Stroke, KinematicResult, KinematicRule } from './core/KinematicRule';
export type { FeatureFingerprint, DensityGrid, DirectionHistogram, CurvatureProfile } from './core/FeatureFingerprint';
export type { ReferenceProfile } from './core/ReferenceProfile';

// Core utilities
export { FeatureExtractor } from './core/FeatureExtractor';
export { createReferenceProfile } from './core/ReferenceProfile';

// Rules
export { ReversalRule as KinematicReversalRule } from './rules/ReversalRule';
export { TimeTakenRule } from './rules/TimeTakenRule';
export { ProportionalDistortionRule } from './rules/ProportionalDistortionRule';
export { ReferenceSimilarityRule } from './rules/ReferenceSimilarityRule';