import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';

export class TimeTakenRule implements KinematicRule {
  public evaluate(strokes: Stroke[], referenceChar: string): KinematicResult {
    const allPoints = strokes.flat();
    if (allPoints.length < 2) return { passed: false, score: 0, message: "Insufficient data." };

    const startTime = allPoints[0].timestamp;
    const endTime = allPoints[allPoints.length - 1].timestamp;
    const durationSeconds = (endTime - startTime) / 1000;

    // A single character usually takes 0.4s to 2.5s.
    // > 4.0s indicates severe cognitive/motor hesitation.
    const isTooSlow = durationSeconds > 4.0;
    const isTooFast = durationSeconds < 0.2;

    let message = "Drawing speed is normal.";
    if (isTooSlow) message = "Dysfluency detected: Drawing is abnormally slow (hesitation).";
    if (isTooFast) message = "Impulsivity detected: Drawing is abnormally fast.";

    return {
      passed: !isTooSlow && !isTooFast,
      score: isTooSlow || isTooFast ? 0 : 1,
      message,
      metadata: { durationSeconds: Number(durationSeconds.toFixed(2)) }
    };
  }
}