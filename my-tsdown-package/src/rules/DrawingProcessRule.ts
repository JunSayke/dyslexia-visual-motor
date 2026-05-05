import simplify from 'simplify-js';
import { FeatureExtractor } from '../core/FeatureExtractor';
import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';
import type { ReferenceProfile } from '../core/ReferenceProfile';

export class DrawingProcessRule implements KinematicRule {
  /**
   * @param liftTolerance Extra pen-lifts allowed beyond the reference.
   * @param jitterRatioThreshold Maximum allowed increase in structural complexity ratio.
   */
  constructor(
    private readonly liftTolerance = 1,
    private readonly jitterRatioThreshold = 0.5 // 50% increase in complexity
  ) {}

  /**
   * Calculates the 'Structural Efficiency' of a drawing.
   * Instead of raw counts, it returns the ratio of (Simplified Points / Total Points).
   * A smooth stroke has a very low ratio; a jittery/tremulous stroke has a high ratio
   * because more points are required to preserve the "noise" during simplification.
   */
  private getStructuralEfficiency(strokes: Stroke[]): number {
    const allPoints = strokes.flat();
    if (allPoints.length < 5) return 1.0;

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const maxDim = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);

    const tolerance = maxDim * 0.02;
    let simplifiedCount = 0;

    for (const stroke of strokes) {
      if (stroke.length < 3) {
        simplifiedCount += stroke.length;
        continue;
      }
      simplifiedCount += simplify(stroke, tolerance, true).length;
    }

    return simplifiedCount / allPoints.length;
  }

  public evaluate(strokes: Stroke[], reference: ReferenceProfile): KinematicResult {
    if (strokes.length === 0) {
      return { passed: false, score: 0, message: 'No drawing data.' };
    }

    const refFingerprint = reference.fingerprint;
    const attemptStrokeCount = strokes.length;
    const referenceStrokeCount = refFingerprint.strokeCount;

    // ── 1. Pen-lift check ──────────────────────────────────────────────────
    const extraLifts = Math.max(0, attemptStrokeCount - referenceStrokeCount);
    const excessiveLifts = extraLifts > this.liftTolerance;

    // ── 2. Jitter Analysis (Efficiency Ratio) ──────────────────────────────
    // We compare how much "noisier" the attempt is compared to the reference.
    const refEfficiency = this.getStructuralEfficiency(reference.referenceStrokes);
    const attemptEfficiency = this.getStructuralEfficiency(strokes);
    
    // Normalize the ratio increase. If ref is 0.1 and attempt is 0.2, that's a 100% increase.
    const efficiencyDrop = (attemptEfficiency - refEfficiency) / (refEfficiency || 1);
    const hasHighJitter = efficiencyDrop > this.jitterRatioThreshold;

    // ── 3. Micro-Reversal Analysis (Tremor) ────────────────────────────────
    let tremorWarning = false;
    try {
      const attempt = FeatureExtractor.extract(strokes);
      // Compare reversal density (reversals per point) rather than raw count
      const refRevDensity = refFingerprint.curvature.reversalCount / reference.referenceStrokes.flat().length;
      const attRevDensity = attempt.curvature.reversalCount / strokes.flat().length;
      
      if (attRevDensity > refRevDensity * 2.5 + 0.05) {
        tremorWarning = true;
      }
    } catch {
      // Fallback to jitter check only
    }

    const dysfluencyDetected = hasHighJitter || tremorWarning;

    // ── 4. Scoring ─────────────────────────────────────────────────────────
    let score = 1.0;
    if (excessiveLifts) score -= (extraLifts * 0.2);
    if (dysfluencyDetected) score -= 0.4;
    
    const passed = !excessiveLifts && !dysfluencyDetected;

    // ── 5. Output ──────────────────────────────────────────────────────────
    const messages: string[] = [];
    if (excessiveLifts) {
      messages.push(`Excessive Pen Lifts (${attemptStrokeCount} vs ref ${referenceStrokeCount}).`);
    }
    if (dysfluencyDetected) {
      messages.push('Dysfluency detected: Stroke shows significant tremor or structural noise.');
    }
    if (passed) {
      messages.push('Drawing process is consistent with reference kinematics.');
    }

    return {
      passed,
      score: +Math.max(0, score).toFixed(3),
      message: messages.join(' '),
      metadata: {
        extraLifts,
        efficiencyDrop: +efficiencyDrop.toFixed(3),
        tremorWarning,
        attemptStrokeCount
      },
    };
  }
}