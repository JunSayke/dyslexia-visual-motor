import type { KinematicRule, Stroke, KinematicResult } from '../core/KinematicRule';

export class ReferenceSimilarityRule implements KinematicRule {
  // Rough expected ink distribution in a 3x3 grid (0-8, left-to-right, top-to-bottom)
  private expectedDensity: Record<string, number[]> = {
    's': [0.15, 0.2, 0.05, 0.05, 0.2, 0.1, 0.05, 0.15, 0.05], // S curves top-mid, mid, bottom-mid
    'z': [0.15, 0.15, 0.1, 0.05, 0.2, 0.05, 0.1, 0.15, 0.05],
    'j': [0.0, 0.15, 0.0, 0.0, 0.25, 0.0, 0.2, 0.2, 0.1]
  };

  public evaluate(strokes: Stroke[], referenceChar: string): KinematicResult {
    const allPoints = strokes.flat();
    if (allPoints.length < 10) return { passed: false, score: 0, message: "Insufficient data." };
    if (!this.expectedDensity[referenceChar]) return { passed: true, score: 1, message: "No density map for this character yet." }; // Bypass for unmapped chars

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = (maxX - minX) || 1;
    const height = (maxY - minY) || 1;

    // Create 3x3 grid
    const grid = new Array(9).fill(0);
    allPoints.forEach(p => {
      const col = Math.min(Math.floor(((p.x - minX) / width) * 3), 2);
      const row = Math.min(Math.floor(((p.y - minY) / height) * 3), 2);
      grid[row * 3 + col]++;
    });

    // Normalize to percentages
    const total = allPoints.length;
    const normalizedGrid = grid.map(count => count / total);
    const expected = this.expectedDensity[referenceChar];

    // Calculate Mean Absolute Error
    let error = 0;
    for (let i = 0; i < 9; i++) {
      error += Math.abs(normalizedGrid[i] - expected[i]);
    }
    
    // Lower error is better. Max possible error is theoretically ~2.0. < 0.8 is usually a good match.
    const isSimilar = error < 0.8;

    return {
      passed: isSimilar,
      score: Math.max(0, 1 - error),
      message: isSimilar ? "Shape matches reference density." : "Similarity Error: Shape does not match structural reference.",
      metadata: { errorScore: Number(error.toFixed(2)) }
    };
  }
}