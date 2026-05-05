import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';

export class ProportionalDistortionRule implements KinematicRule {
  // Expected Width/Height ratios for standard characters
  private expectedRatios: Record<string, number> = {
    's': 0.6, 'z': 0.8, 'b': 0.6, 'd': 0.6, 'p': 0.6, 'q': 0.6, 'j': 0.4, '3': 0.6, '7': 0.7, 'spiral': 1.0
  };

  public evaluate(strokes: Stroke[], referenceChar: string): KinematicResult {
    const allPoints = strokes.flat();
    if (allPoints.length < 5) return { passed: false, score: 0, message: "Insufficient data." };

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    
    // Protect against division by zero
    const actualRatio = height > 0 ? width / height : 1; 
    const expectedRatio = this.expectedRatios[referenceChar] || 0.6;

    // Tolerance: Allow 40% deviation from the ideal ratio
    const deviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;
    const isDistorted = deviation > 0.40;

    return {
      passed: !isDistorted,
      score: Math.max(0, 1 - deviation), // Closer to 0 deviation = higher score
      message: isDistorted ? "Proportional Distortion: Shape is overly squashed or stretched." : "Proportions are normal.",
      metadata: { actualRatio: Number(actualRatio.toFixed(2)), expectedRatio, deviation: Number(deviation.toFixed(2)) }
    };
  }
}