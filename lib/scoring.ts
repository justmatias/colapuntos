export interface Podium {
  p1: string;
  p2: string;
  p3: string;
}

export interface ScoreBreakdown {
  p1: number;
  p2: number;
  p3: number;
}

export interface ScoreResult {
  points: number;
  breakdown: ScoreBreakdown;
}

const EXACT_POINTS: Record<keyof Podium, number> = { p1: 10, p2: 7, p3: 5 };
const WRONG_POSITION_POINTS = 3;

export function calculateScore(prediction: Podium, result: Podium): ScoreResult {
  const realPodium = new Set([result.p1, result.p2, result.p3]);
  const breakdown: ScoreBreakdown = { p1: 0, p2: 0, p3: 0 };

  for (const pos of ["p1", "p2", "p3"] as const) {
    if (prediction[pos] === result[pos]) {
      breakdown[pos] = EXACT_POINTS[pos];
    } else if (realPodium.has(prediction[pos])) {
      breakdown[pos] = WRONG_POSITION_POINTS;
    }
  }

  return {
    points: breakdown.p1 + breakdown.p2 + breakdown.p3,
    breakdown,
  };
}
