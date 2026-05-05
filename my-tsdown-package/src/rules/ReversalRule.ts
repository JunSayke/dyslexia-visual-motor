import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';
import type { ReferenceProfile } from '../core/ReferenceProfile';

interface Point2D {
  x: number;
  y: number;
}

export class ReversalRule implements KinematicRule {
  /**
   * @param ratioThreshold The flipped distance must be less than this percentage 
   *                       of the normal distance to be flagged as reversed.
   *                       0.90 means the flipped match must be 10% closer.
   */
  constructor(private readonly ratioThreshold = 0.90) {}

  public evaluate(strokes: Stroke[], reference: ReferenceProfile): KinematicResult {
    const attemptPoints = strokes.flat();
    const referencePoints = reference.referenceStrokes.flat();

    if (attemptPoints.length < 3 || referencePoints.length < 3) {
      return { passed: false, score: 0, message: 'Insufficient data.' };
    }

    // 1. Normalize both drawings to a 1x1 grid
    const attemptCloud = this.normalizeCloud(attemptPoints);
    const normalRefCloud = this.normalizeCloud(referencePoints);

    // 2. Create a horizontally mirrored version of the reference cloud
    const flippedRefCloud = this.flipCloudHorizontally(normalRefCloud);

    // 3. Calculate spatial distances
    const normalDistance = this.calculateCloudDistance(attemptCloud, normalRefCloud);
    const flippedDistance = this.calculateCloudDistance(attemptCloud, flippedRefCloud);

    // 4. FIX: Use a proportional threshold to detect reversals.
    // In your test case: 0.06 < (0.082 * 0.90) -> 0.06 < 0.0738 (Evaluates to TRUE)
    const isReversed = flippedDistance < (normalDistance * this.ratioThreshold);
    
    // Convert distance to a 0-1 score (higher is better). 
    // If it's reversed, we penalize the score heavily.
    const baseScore = Math.max(0, 1 - normalDistance);
    const finalScore = isReversed ? baseScore * 0.3 : baseScore;

    return {
      passed: !isReversed,
      score: +finalScore.toFixed(3),
      message: isReversed
        ? `Reversal Detected: Shape is geometrically mirrored.`
        : `Orientation matches reference "${reference.label}".`,
      metadata: {
        normalDistance: +normalDistance.toFixed(3),
        flippedDistance: +flippedDistance.toFixed(3),
        isReversed,
        analysisMethod: 'Point Cloud Matching (Mean Closest Point)'
      },
    };
  }

  private normalizeCloud(points: Point2D[]): Point2D[] {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    const normalized: Point2D[] = [];
    const step = Math.ceil(points.length / 100); 

    for (let i = 0; i < points.length; i += step) {
      normalized.push({
        x: (points[i].x - minX) / width,
        y: (points[i].y - minY) / height,
      });
    }

    return normalized;
  }

  private flipCloudHorizontally(cloud: Point2D[]): Point2D[] {
    return cloud.map(p => ({
      x: 1 - p.x, 
      y: p.y
    }));
  }

  private calculateCloudDistance(cloudA: Point2D[], cloudB: Point2D[]): number {
    let totalDistance = 0;

    for (const pA of cloudA) {
      let minDistanceSq = Infinity;
      
      for (const pB of cloudB) {
        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
        }
      }
      
      totalDistance += Math.sqrt(minDistanceSq);
    }

    return totalDistance / cloudA.length;
  }
}