import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';
import type { ReferenceProfile } from '../core/ReferenceProfile';

/**
 * TimeTakenRule
 *
 * Drawing time is universal — it doesn't depend on which shape is drawn.
 * The only change from the original is the method signature: the second
 * parameter is now a ReferenceProfile rather than a raw character string.
 * The reference is accepted but intentionally unused (it's available to
 * subclasses that might want to set per-shape time windows).
 */
export class TimeTakenRule implements KinematicRule {
  /**
   * @param minMs   Minimum acceptable duration in ms. Below this = impulsive.
   * @param maxMs   Maximum acceptable duration in ms. Above this = hesitant.
   */
  constructor(
    private readonly minMs = 200,
    private readonly maxMs = 4000,
  ) {}

  public evaluate(
    strokes: Stroke[],
    _reference: ReferenceProfile,
  ): KinematicResult {
    const allPoints = strokes.flat();
    if (allPoints.length < 2) {
      return { passed: false, score: 0, message: 'Insufficient data.' };
    }

    const startTime = allPoints[0].timestamp;
    const endTime = allPoints[allPoints.length - 1].timestamp;
    const durationMs = endTime - startTime;
    const durationSeconds = durationMs / 1000;

    const isTooSlow = durationMs > this.maxMs;
    const isTooFast = durationMs < this.minMs;

    let message = 'Drawing speed is normal.';
    if (isTooSlow) {
      message = `Dysfluency Detected: drawing took ${durationSeconds.toFixed(1)}s (threshold: ${this.maxMs / 1000}s). Possible hesitation.`;
    } else if (isTooFast) {
      message = `Impulsivity Detected: drawing took ${durationSeconds.toFixed(1)}s (threshold: ${this.minMs / 1000}s).`;
    }

    return {
      passed: !isTooSlow && !isTooFast,
      score: isTooSlow || isTooFast ? 0 : 1,
      message,
      metadata: {
        durationSeconds: +durationSeconds.toFixed(2),
        durationMs,
        minMs: this.minMs,
        maxMs: this.maxMs,
      },
    };
  }
}