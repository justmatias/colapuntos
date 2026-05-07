"use server";

import { recalculateScoresForGP as _recalculate } from "@/lib/scoring-recalc";

export async function recalculateScoresForGP(grandPrixId: string): Promise<void> {
  return _recalculate(grandPrixId);
}
