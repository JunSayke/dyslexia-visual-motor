import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';

export class DrawingProcessRule implements KinematicRule {
  public evaluate(strokes: Stroke[], referenceChar: string): KinematicResult {
    if (strokes.length === 0) return { passed: false, score: 0, message: "No data." };

    const strokeCount = strokes.length;
    let excessiveLifts = false;

    // Single-continuous letters shouldn't have many lifts
    if (['s', 'z', '3', '7', 'spiral'].includes(referenceChar) && strokeCount > 2) {
      excessiveLifts = true;
    }
    // Letters with stems (b, d, p, q, j) might naturally have 2 strokes
    if (['b', 'd', 'p', 'q', 'j'].includes(referenceChar) && strokeCount > 3) {
      excessiveLifts = true;
    }

    // Check drawing direction of the main stroke (top-to-bottom is standard)
    const mainStroke = strokes.reduce((prev, curr) => curr.length > prev.length ? curr : prev, strokes[0]);
    const startY = mainStroke[0].y;
    const endY = mainStroke[mainStroke.length - 1].y;
    const drawnBottomToTop = startY > endY;

    // Note: We don't necessarily fail them for bottom-to-top, but it's vital metadata for the clinician
    return {
      passed: !excessiveLifts,
      score: excessiveLifts ? 0 : 1,
      message: excessiveLifts ? `Process Error: Excessive pen lifts detected (${strokeCount} strokes).` : "Drawing process is continuous.",
      metadata: { strokeCount, drawnBottomToTop }
    };
  }
}