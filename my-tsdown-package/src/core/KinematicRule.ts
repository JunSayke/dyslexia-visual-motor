export interface Point {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export type Stroke = Point[];

export interface KinematicResult {
  passed: boolean;
  score: number; // 0 to 1
  message: string;
  metadata?: Record<string, any>;
}

export interface KinematicRule {
  evaluate(strokes: Stroke[], referenceChar: string): KinematicResult;
}