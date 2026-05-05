import { FeatureExtractor } from "../core/FeatureExtractor";
import type {
  KinematicRule,
  Stroke,
  KinematicResult,
  Point,
} from "../core/KinematicRule";
import type { ReferenceProfile } from "../core/ReferenceProfile";

export class ProportionalDistortionRule implements KinematicRule {
  // Tightened default tolerance since log-ratio is more precise
  constructor(private readonly tolerance = 0.35) {}

  private readonly axisTolerance = 0.4;
  private readonly minScaleRatio = 0.35;
  private readonly maxScaleRatio = 3.0;
  private readonly trimRatio = 0.05;

  public evaluate(
    strokes: Stroke[],
    reference: ReferenceProfile,
  ): KinematicResult {
    const attemptPoints = strokes.flat();
    const referencePoints = reference.referenceStrokes.flat();
    if (attemptPoints.length < 3 || referencePoints.length < 3) {
      return { passed: false, score: 0, message: "Insufficient data." };
    }

    const refBounds = this.trimmedBounds(referencePoints, this.trimRatio);
    const attBounds = this.trimmedBounds(attemptPoints, this.trimRatio);

    const expectedRatio = refBounds.width / refBounds.height;
    const actualRatio = attBounds.width / attBounds.height;

    // 1. Aspect ratio check (robust to outliers via trimmed bounds)
    const logDeviation = Math.abs(Math.log(actualRatio / expectedRatio));
    const ratioPassed = logDeviation <= this.tolerance;

    // 2. Axis balance check (row/column mass vs reference)
    const refGrid = reference.fingerprint.densityGrid;
    const attemptGrid = FeatureExtractor.computeDensityGrid(
      attemptPoints,
      FeatureExtractor.boundingBox(attemptPoints),
      refGrid.resolution,
    );
    const axisError = this.axisProfileError(
      refGrid.values,
      attemptGrid.values,
      refGrid.resolution,
    );
    const axisPassed = axisError <= this.axisTolerance;

    // 3. Absolute scale check (extreme size mismatch only)
    const refArea = refBounds.width * refBounds.height;
    const attArea = attBounds.width * attBounds.height;
    const areaRatio = attArea / refArea;
    const scaleMismatch =
      areaRatio < this.minScaleRatio || areaRatio > this.maxScaleRatio;

    const passed = ratioPassed && axisPassed && !scaleMismatch;

    const ratioScore = this.normalizedScore(logDeviation, this.tolerance);
    const axisScore = this.normalizedScore(axisError, this.axisTolerance);
    let score = (ratioScore + axisScore) / 2;
    if (scaleMismatch) {
      score = Math.max(0, score - 0.3);
    }

    const messages: string[] = [];
    if (!ratioPassed) {
      messages.push(
        `Proportional Distortion: Shape is too ${actualRatio > expectedRatio ? "wide" : "tall"}.`,
      );
    }
    if (!axisPassed) {
      const axisHint =
        this.axisDominanceHint(refGrid.values, attemptGrid.values, refGrid.resolution);
      messages.push(
        `Proportional Distortion: ${axisHint} differs from reference.`,
      );
    }
    if (scaleMismatch) {
      messages.push(
        `Scale Mismatch: Drawing is significantly ${areaRatio < 1 ? "smaller" : "larger"} than reference.`,
      );
    }

    const message =
      messages.length === 0 ? "Proportions are normal." : messages.join(" ");

    return {
      passed,
      score: +score.toFixed(3),
      message,
      metadata: {
        actual: Number(actualRatio.toFixed(2)),
        expected: Number(expectedRatio.toFixed(2)),
        areaRatio: Number(areaRatio.toFixed(2)),
        logDeviation: Number(logDeviation.toFixed(3)),
        axisError: Number(axisError.toFixed(3)),
        tolerance: this.tolerance,
        axisTolerance: this.axisTolerance,
        scaleBounds: {
          min: this.minScaleRatio,
          max: this.maxScaleRatio,
        },
        trimRatio: this.trimRatio,
      },
    };
  }

  private trimmedBounds(points: Point[], trimRatio: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    if (points.length < 5 || trimRatio <= 0) {
      return FeatureExtractor.boundingBox(points);
    }

    const xs = points.map(p => p.x).sort((a, b) => a - b);
    const ys = points.map(p => p.y).sort((a, b) => a - b);
    const lo = Math.floor(xs.length * trimRatio);
    const hi = Math.max(lo, Math.ceil(xs.length * (1 - trimRatio)) - 1);

    const minX = xs[lo] ?? xs[0];
    const maxX = xs[hi] ?? xs[xs.length - 1];
    const minY = ys[lo] ?? ys[0];
    const maxY = ys[hi] ?? ys[ys.length - 1];

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: (maxX - minX) || 1,
      height: (maxY - minY) || 1,
    };
  }

  private axisProfileError(
    refGrid: number[],
    attGrid: number[],
    resolution: number,
  ): number {
    const ref = this.axisMass(refGrid, resolution);
    const att = this.axisMass(attGrid, resolution);
    const rowError = this.l1Distance(ref.rows, att.rows) / 2;
    const colError = this.l1Distance(ref.cols, att.cols) / 2;
    return (rowError + colError) / 2;
  }

  private axisDominanceHint(
    refGrid: number[],
    attGrid: number[],
    resolution: number,
  ): string {
    const ref = this.axisMass(refGrid, resolution);
    const att = this.axisMass(attGrid, resolution);
    const rowError = this.l1Distance(ref.rows, att.rows);
    const colError = this.l1Distance(ref.cols, att.cols);
    return rowError >= colError ? "vertical balance" : "horizontal balance";
  }

  private axisMass(grid: number[], resolution: number): {
    rows: number[];
    cols: number[];
  } {
    const rows = new Array(resolution).fill(0);
    const cols = new Array(resolution).fill(0);

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const value = grid[row * resolution + col] ?? 0;
        rows[row] += value;
        cols[col] += value;
      }
    }

    return { rows, cols };
  }

  private l1Distance(a: number[], b: number[]): number {
    let total = 0;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    }
    return total;
  }

  private normalizedScore(error: number, tolerance: number): number {
    if (tolerance <= 0) return 0;
    return Math.max(0, 1 - error / tolerance);
  }
}
