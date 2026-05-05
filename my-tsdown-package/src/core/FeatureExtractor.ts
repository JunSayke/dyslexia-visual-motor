import simplify from 'simplify-js';
import { lineAngle } from 'geometric';
import type { Stroke, Point } from './KinematicRule';
import type {
  FeatureFingerprint,
  DensityGrid,
  DirectionHistogram,
  CurvatureProfile,
} from './FeatureFingerprint';

/**
 * FeatureExtractor
 *
 * The auto-detection pipeline. Accepts any set of strokes and returns a
 * FeatureFingerprint — without knowing what shape is being drawn.
 *
 * Usage:
 *   const fingerprint = FeatureExtractor.extract(strokes);
 */
export class FeatureExtractor {
  /** Grid resolution used for density maps. 3 = 3×3, 4 = 4×4. */
  static readonly GRID_RESOLUTION = 3;
  /** Number of directional buckets in the movement histogram. */
  static readonly DIRECTION_BUCKETS = 8;
  /** simplify-js tolerance for corner detection. */
  static readonly SIMPLIFY_TOLERANCE = 1.5;
  /** Minimum turn angle (degrees) to count as a sharp corner. */
  static readonly CORNER_ANGLE_THRESHOLD = 65;
  /** Minimum curvature delta (radians) to count as a kinematic reversal. */
  static readonly REVERSAL_ANGLE_THRESHOLD = Math.PI / 2;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Extract a FeatureFingerprint from any set of strokes.
   * Throws if there are fewer than 3 points total.
   */
  static extract(strokes: Stroke[]): FeatureFingerprint {
    const allPoints = strokes.flat();
    if (allPoints.length < 3) {
      throw new Error(`FeatureExtractor: need ≥3 points, got ${allPoints.length}`);
    }

    const bbox = this.boundingBox(allPoints);

    return {
      proportions: {
        widthToHeightRatio: bbox.width / bbox.height,
      },
      densityGrid: this.computeDensityGrid(
        allPoints,
        bbox,
        this.GRID_RESOLUTION,
      ),
      directionHistogram: this.computeDirectionHistogram(allPoints),
      curvature: this.computeCurvatureProfile(allPoints),
      strokeCount: strokes.length,
      windingScore: this.computeWindingScore(allPoints),
      terminalBias: this.computeTerminalBias(strokes, bbox),
      cornerCount: this.computeCornerCount(strokes),
    };
  }

  // ---------------------------------------------------------------------------
  // Bounding box
  // ---------------------------------------------------------------------------

  static boundingBox(points: Point[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: (maxX - minX) || 1,
      height: (maxY - minY) || 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Density grid
  // ---------------------------------------------------------------------------

  /**
   * Divides the bounding box into an N×N grid and measures the fraction of
   * ink in each cell. Replaces hardcoded `expectedDensity` tables.
   */
  static computeDensityGrid(
    points: Point[],
    bbox: ReturnType<typeof FeatureExtractor.boundingBox>,
    resolution: number,
  ): DensityGrid {
    const grid = new Array(resolution * resolution).fill(0);

    for (const p of points) {
      const col = Math.min(
        Math.floor(((p.x - bbox.minX) / bbox.width) * resolution),
        resolution - 1,
      );
      const row = Math.min(
        Math.floor(((p.y - bbox.minY) / bbox.height) * resolution),
        resolution - 1,
      );
      grid[row * resolution + col]++;
    }

    const total = points.length;
    return {
      values: grid.map(count => count / total),
      resolution,
    };
  }

  // ---------------------------------------------------------------------------
  // Direction histogram
  // ---------------------------------------------------------------------------

  /**
   * Computes the distribution of movement directions across 8 cardinal buckets.
   * Chirality and mirroring are captured here without per-character branching.
   */
  static computeDirectionHistogram(points: Point[]): DirectionHistogram {
    const buckets = new Array(this.DIRECTION_BUCKETS).fill(0);
    let count = 0;

    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      if (Math.hypot(dx, dy) < 0.5) continue; // skip near-static samples

      // atan2 returns [-π, π]; map to [0, 2π), then bucket
      const angle = Math.atan2(dy, dx);
      const normalized = (angle + Math.PI) / (2 * Math.PI); // [0, 1)
      const bucket =
        Math.floor(normalized * this.DIRECTION_BUCKETS) %
        this.DIRECTION_BUCKETS;
      buckets[bucket]++;
      count++;
    }

    const total = count || 1;
    return { buckets: buckets.map(b => b / total) };
  }

  // ---------------------------------------------------------------------------
  // Curvature
  // ---------------------------------------------------------------------------

  /**
   * Computes per-step angle changes. High mean = curvy shape.
   * High std = erratic / tremor. reversalCount = abrupt direction flips.
   */
  static computeCurvatureProfile(points: Point[]): CurvatureProfile {
    const deltas: number[] = [];
    let reversalCount = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const dx1 = points[i].x - points[i - 1].x;
      const dy1 = points[i].y - points[i - 1].y;
      const dx2 = points[i + 1].x - points[i].x;
      const dy2 = points[i + 1].y - points[i].y;

      const a1 = Math.atan2(dy1, dx1);
      const a2 = Math.atan2(dy2, dx2);

      let delta = a2 - a1;
      // Normalize to (-π, π]
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      deltas.push(Math.abs(delta));

      if (
        i > 1 &&
        Math.abs(delta - deltas[deltas.length - 2]) >
          this.REVERSAL_ANGLE_THRESHOLD
      ) {
        reversalCount++;
      }
    }

    const n = deltas.length || 1;
    const mean = deltas.reduce((s, v) => s + v, 0) / n;
    const variance = deltas.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

    return { mean, std: Math.sqrt(variance), reversalCount };
  }

  // ---------------------------------------------------------------------------
  // Winding score
  // ---------------------------------------------------------------------------

  /**
   * Computes an overall chirality proxy (positive = CW, negative = CCW).
   * Sign comparison replaces the hardcoded s-vs-z, b-vs-d, etc. branch logic.
   *
   * Samples 4 evenly-spaced points and computes a simplified signed winding.
   */
  static computeWindingScore(points: Point[]): number {
    if (points.length < 4) return 0;

    const step = Math.floor(points.length / 4);
    const p0 = points[0];
    const p1 = points[step];
    const p2 = points[step * 2];
    const p3 = points[step * 3];

    const isTopToBottom = p3.y > p0.y;
    const modifier = isTopToBottom ? 1 : -1;

    const dx1 = (p1.x - p0.x) * modifier;
    const dx2 = (p2.x - p1.x) * modifier;
    const dx3 = (p3.x - p2.x) * modifier;

    // Pattern: start-right, cross-left, end-right → positive = S-like (CW from top)
    return dx1 - dx2 + dx3;
  }

  // ---------------------------------------------------------------------------
  // Terminal bias
  // ---------------------------------------------------------------------------

  /**
   * Returns the normalized X of the average of the first and last point across
   * all strokes: 0 = leftmost extent, 1 = rightmost.
   *
   * Replaces hardcoded `evaluateTerminalBias` character logic.
   */
  static computeTerminalBias(
    strokes: Stroke[],
    bbox: ReturnType<typeof FeatureExtractor.boundingBox>,
  ): number {
    const allPoints = strokes.flat();
    if (allPoints.length < 2) return 0.5;

    const startX = allPoints[0].x;
    const endX = allPoints[allPoints.length - 1].x;
    const avgX = (startX + endX) / 2;
    return (avgX - bbox.minX) / bbox.width;
  }

  // ---------------------------------------------------------------------------
  // Corner count
  // ---------------------------------------------------------------------------

  /**
   * Counts sharp corners (angle > CORNER_ANGLE_THRESHOLD) in the simplified
   * stroke. Replaces per-character corner thresholds.
   */
  static computeCornerCount(strokes: Stroke[]): number {
    const mainStroke = strokes.reduce(
      (best, s) => (s.length > best.length ? s : best),
      strokes[0],
    );
    const simplified = simplify(mainStroke, this.SIMPLIFY_TOLERANCE, true) as {
      x: number;
      y: number;
    }[];

    let corners = 0;
    for (let i = 1; i < simplified.length - 1; i++) {
      const p1 = simplified[i - 1];
      const p2 = simplified[i];
      const p3 = simplified[i + 1];

      const a1 = lineAngle([[p1.x, p1.y], [p2.x, p2.y]]);
      const a2 = lineAngle([[p2.x, p2.y], [p3.x, p3.y]]);
      let diff = Math.abs(a1 - a2);
      if (diff > 180) diff = 360 - diff;

      if (diff > this.CORNER_ANGLE_THRESHOLD) {
        corners++;
        i++; // skip the apex to avoid double-counting
      }
    }
    return corners;
  }
}