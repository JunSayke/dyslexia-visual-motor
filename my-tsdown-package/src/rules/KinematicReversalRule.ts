import simplify from 'simplify-js';
import { lineAngle } from 'geometric';
import type { KinematicRule, Stroke, KinematicResult, Point } from '../core/KinematicRule';

export class KinematicReversalRule implements KinematicRule {
  public evaluate(strokes: Stroke[], referenceChar: string): KinematicResult {
    // 1. RAW DATA: Use unsimplified data for density, temporal, and spatial checks
    const rawPoints = strokes.flat();
    if (rawPoints.length < 5) return { passed: false, score: 0, message: "Insufficient data." };

    const rawMainStroke = this.findMainStroke(strokes);
    
    // 2. CLEAN DATA: Use simplify-js ONLY for structural/corner detection
    const cleanMainStroke = simplify(rawMainStroke, 1.5, true) as Stroke;

    const xs = rawPoints.map(p => p.x);
    const ys = rawPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = (maxX - minX) || 1;
    const height = (maxY - minY) || 1;

    // Structure validation uses the CLEANED stroke
    const structure = this.validateStructure(cleanMainStroke, referenceChar, width, height);
    if (!structure.isValid) {
      return { passed: false, score: 0, message: `Incorrect Shape: ${structure.reason}`, metadata: structure.meta };
    }

    // Routing Logic uses RAW points to maintain density and temporal integrity
    if (referenceChar === 's' || referenceChar === 'z') {
      return this.evaluateTemporalWinding(rawPoints, referenceChar);
    }
    if (referenceChar === '3' || referenceChar === '7') {
      return this.evaluateTerminalBias(rawPoints, minX, width, referenceChar);
    } 
    if (referenceChar === 'j') {
      const stemXPercent = this.calculateStemX(rawMainStroke, minX, width);
      return this.evaluateHookRelative(rawMainStroke, stemXPercent, minX, width, minY, height);
    }

    return this.evaluateStemAndLoop(rawPoints, referenceChar, minX, width, minY, height);
  }

  private validateStructure(cleanStroke: Stroke, ref: string, w: number, h: number): { isValid: boolean, reason?: string, meta?: any } {
    const aspectRatio = h / w;
    const corners = this.countSharpCorners(cleanStroke);

    if (ref === 's') {
      if (corners > 1) return { isValid: false, reason: "Shape is too sharp/angular for an 's'.", meta: { corners } };
      if (aspectRatio > 2.2 || aspectRatio < 0.6) return { isValid: false, reason: "Proportion is incorrect.", meta: { aspectRatio } };
    }

    if (ref === 'z') {
      if (corners < 2) return { isValid: false, reason: "Shape lacks the sharp corners of a 'z'.", meta: { corners } };
      if (aspectRatio > 1.8 || aspectRatio < 0.4) return { isValid: false, reason: "Proportion is incorrect.", meta: { aspectRatio } };
    }

    if (ref === 'j' && aspectRatio < 1.3) return { isValid: false, reason: "Shape is too wide.", meta: { aspectRatio } };
    if (ref === '3' && aspectRatio < 0.8) return { isValid: false, reason: "Number is too squashed.", meta: { aspectRatio } };
    if (['b', 'd', 'p', 'q'].includes(ref) && aspectRatio < 1.1) return { isValid: false, reason: "Lacks vertical height.", meta: { aspectRatio } };

    return { isValid: true };
  }

  private countSharpCorners(cleanStroke: Stroke): number {
    let sharpTurns = 0;
    
    // Step by 1! Since simplify-js removed the noise, every point left is structurally important.
    for (let i = 1; i < cleanStroke.length - 1; i++) {
      const p1 = cleanStroke[i - 1];
      const p2 = cleanStroke[i];
      const p3 = cleanStroke[i + 1];

      const angle1 = lineAngle([[p1.x, p1.y], [p2.x, p2.y]]);
      const angle2 = lineAngle([[p2.x, p2.y], [p3.x, p3.y]]);

      let diff = Math.abs(angle1 - angle2);
      if (diff > 180) diff = 360 - diff;

      // Lowered threshold slightly to 65 to catch z-corners on simplified lines
      if (diff > 65) {
        sharpTurns++;
        i++; // Skip one to avoid double-counting the apex of the same corner
      }
    }
    return sharpTurns;
  }

  private evaluateTemporalWinding(allPoints: Point[], ref: string): KinematicResult {
    if (allPoints.length < 9) return { passed: false, score: 0, message: "Stroke too short." };

    const chunkSize = Math.floor(allPoints.length / 3);
    const p0 = allPoints[0];
    const p1 = allPoints[chunkSize];
    const p2 = allPoints[chunkSize * 2];
    const p3 = allPoints[allPoints.length - 1];

    const dx1 = p1.x - p0.x;
    const dx2 = p2.x - p1.x;
    const dx3 = p3.x - p2.x;

    const isTopToBottom = p3.y > p0.y;
    const modifier = isTopToBottom ? 1 : -1;

    const n_dx1 = dx1 * modifier;
    const n_dx2 = dx2 * modifier;
    const n_dx3 = dx3 * modifier;

    const windingScore = n_dx1 - n_dx2 + n_dx3;

    let isCorrectOrientation = false;
    if (ref === 's') isCorrectOrientation = windingScore < 0;
    else if (ref === 'z') isCorrectOrientation = windingScore > 0;

    return { passed: isCorrectOrientation, score: isCorrectOrientation ? 1 : 0, message: isCorrectOrientation ? `Correct orientation for '${ref}'.` : `Reversal Detected: '${ref}' is mirrored.`, metadata: { windingScore } };
  }

  private evaluateTerminalBias(points: Point[], minX: number, width: number, ref: string): KinematicResult {
    const centerX = minX + (width / 2);
    const startX = points[0].x;
    const endX = points[points.length - 1].x;
    const avgTerminalX = (startX + endX) / 2;

    const isLeft = avgTerminalX < centerX;
    return { passed: isLeft, score: isLeft ? 1 : 0, message: isLeft ? `Correct orientation for '${ref}'.` : `Reversal Detected.`, metadata: { avgTerminalX, centerX } };
  }

  private calculateStemX(stroke: Stroke, minX: number, width: number): number {
    const binCount = 20;
    const bins = new Array(binCount).fill(0);
    stroke.forEach(p => {
      const binIdx = Math.min(Math.floor(((p.x - minX) / width) * binCount), binCount - 1);
      bins[binIdx]++;
    });
    return bins.indexOf(Math.max(...bins)) / binCount;
  }

  private evaluateHookRelative(stroke: Stroke, stemXPercent: number, minX: number, width: number, minY: number, height: number): KinematicResult {
    const bottomPoints = stroke.filter(p => (p.y - minY) / height > 0.75);
    if (bottomPoints.length === 0) return { passed: false, score: 0, message: "No hook detected." };
    const hookXAvg = bottomPoints.reduce((a, b) => a + b.x, 0) / bottomPoints.length;
    const hookXPercent = (hookXAvg - minX) / width;
    const isHookLeft = hookXPercent < stemXPercent;

    return { passed: isHookLeft, score: isHookLeft ? 1 : 0, message: isHookLeft ? "Correct orientation for 'j'." : "Reversal Detected: The hook faces right.", metadata: { isHookLeft } };
  }

  private evaluateStemAndLoop(allPoints: Point[], reference: string, minX: number, width: number, minY: number, height: number): KinematicResult {
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const stemXPercent = this.calculateStemX(allPoints, minX, width);
    const avgXPercent = (xs.reduce((a, b) => a + b, 0) / xs.length - minX) / width;
    const avgYPercent = (ys.reduce((a, b) => a + b, 0) / ys.length - minY) / height;

    const isRight = avgXPercent > stemXPercent;
    const isBottom = avgYPercent > 0.5;
    
    let detected = 'unknown';
    if (isRight && isBottom) detected = 'b';
    else if (!isRight && isBottom) detected = 'd';
    else if (isRight && !isBottom) detected = 'p';
    else if (!isRight && !isBottom) detected = 'q';

    const passed = detected === reference;
    return { passed, score: passed ? 1 : 0, message: passed ? `Correct orientation for '${reference}'.` : `Reversal Detected. Matches '${detected}'.`, metadata: { detected } };
  }

  private findMainStroke(strokes: Stroke[]): Stroke {
    return strokes.reduce((prev, curr) => (curr.length > prev.length ? curr : prev), strokes[0]);
  }
}