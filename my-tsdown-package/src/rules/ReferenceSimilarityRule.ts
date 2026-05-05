import { FeatureExtractor } from '../core/FeatureExtractor';
import type { KinematicRule, Stroke, KinematicResult, Point } from '../core/KinematicRule';
import type { ReferenceProfile } from '../core/ReferenceProfile';

/**
 * ReferenceSimilarityRule
 *
 * Uses a multi-feature similarity score to reduce false positives.
 * The score blends density grid match, point-cloud distance, direction
 * histogram alignment, and corner count differences.
 */
export class ReferenceSimilarityRule implements KinematicRule {
  private readonly gridResolution = 6;
  private readonly entropyScaleFactor = 0.25;
  private readonly weights = {
    grid: 0.55,
    cloud: 0.2,
    direction: 0.15,
    corners: 0.1,
  };

  constructor(private readonly threshold = 0.72) {}

  public evaluate(strokes: Stroke[], reference: ReferenceProfile): KinematicResult {
    let attempt;
    try {
      attempt = FeatureExtractor.extract(strokes);
    } catch {
      return { passed: false, score: 0, message: 'Insufficient data.' };
    }

    const attemptPoints = strokes.flat();
    const referencePoints = reference.referenceStrokes.flat();
    if (attemptPoints.length < 3 || referencePoints.length < 3) {
      return { passed: false, score: 0, message: 'Insufficient data.' };
    }

    const targetResolution = Math.max(
      reference.fingerprint.densityGrid.resolution,
      this.gridResolution,
    );

    const referenceGrid = FeatureExtractor.computeDensityGrid(
      referencePoints,
      FeatureExtractor.boundingBox(referencePoints),
      targetResolution,
    ).values;
    const attemptGrid = FeatureExtractor.computeDensityGrid(
      attemptPoints,
      FeatureExtractor.boundingBox(attemptPoints),
      targetResolution,
    ).values;

    const rawGridError = this.l1Distance(attemptGrid, referenceGrid);
    const entropy = this.normalizedEntropy(referenceGrid);
    const entropyScale = 1 - entropy * this.entropyScaleFactor;
    const gridError = Math.min(1, (rawGridError / 2) * entropyScale);
    const gridSimilarity = 1 - gridError;

    const directionError =
      this.l1Distance(
        attempt.directionHistogram.buckets,
        reference.fingerprint.directionHistogram.buckets,
      ) / 2;
    const directionSimilarity = 1 - Math.min(1, directionError);

    const cloudError = this.normalizedCloudDistance(attemptPoints, referencePoints);
    const cloudSimilarity = 1 - cloudError;

    const cornerDiff = Math.abs(
      attempt.cornerCount - reference.fingerprint.cornerCount,
    );
    const cornerError = this.cornerError(cornerDiff, reference.fingerprint.cornerCount);
    const cornerSimilarity = 1 - cornerError;

    const weightedScore =
      this.weights.grid * gridSimilarity +
      this.weights.cloud * cloudSimilarity +
      this.weights.direction * directionSimilarity +
      this.weights.corners * cornerSimilarity;

    const isSimilar = weightedScore >= this.threshold;

    return {
      passed: isSimilar,
      score: +Math.max(0, weightedScore).toFixed(3),
      message: isSimilar
        ? `Shape matches reference "${reference.label}".`
        : `Similarity Error: Shape does not match structural reference "${reference.label}".`,
      metadata: {
        gridSimilarity: +gridSimilarity.toFixed(3),
        directionSimilarity: +directionSimilarity.toFixed(3),
        cloudSimilarity: +cloudSimilarity.toFixed(3),
        cornerSimilarity: +cornerSimilarity.toFixed(3),
        rawGridError: +rawGridError.toFixed(3),
        gridError: +gridError.toFixed(3),
        referenceEntropy: +entropy.toFixed(3),
        threshold: this.threshold,
        targetResolution,
        weights: this.weights,
      },
    };
  }

  /**
   * Shannon entropy of the grid, normalized to [0, 1].
   * 0 = all ink in one cell (maximally concentrated).
   * 1 = ink perfectly uniform across all cells.
   */
  private normalizedEntropy(grid: number[]): number {
    const n = grid.length;
    if (n <= 1) return 0;
    const maxEntropy = Math.log2(n);
    let entropy = 0;
    for (const p of grid) {
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy / maxEntropy;
  }

  private l1Distance(a: number[], b: number[]): number {
    let total = 0;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    }
    return total;
  }

  private normalizedCloudDistance(attempt: Point[], reference: Point[]): number {
    const attemptCloud = this.normalizeCloud(attempt);
    const referenceCloud = this.normalizeCloud(reference);
    if (attemptCloud.length === 0 || referenceCloud.length === 0) return 1;

    const distA = this.calculateCloudDistance(attemptCloud, referenceCloud);
    const distB = this.calculateCloudDistance(referenceCloud, attemptCloud);
    const avgDist = (distA + distB) / 2;

    return Math.min(1, avgDist / Math.SQRT2);
  }

  private normalizeCloud(points: Point[]): Point[] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const step = Math.ceil(points.length / 120);
    const normalized: Point[] = [];

    for (let i = 0; i < points.length; i += step) {
      normalized.push({
        ...points[i],
        x: (points[i].x - minX) / width,
        y: (points[i].y - minY) / height,
      });
    }

    return normalized;
  }

  private calculateCloudDistance(a: Point[], b: Point[]): number {
    let totalDistance = 0;

    for (const pA of a) {
      let minDistSq = Infinity;
      for (const pB of b) {
        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
        }
      }
      totalDistance += Math.sqrt(minDistSq);
    }

    return totalDistance / a.length;
  }

  private cornerError(diff: number, referenceCorners: number): number {
    const denom = Math.max(2, referenceCorners || 0);
    return Math.min(1, diff / denom);
  }
}