"use server";

import { connectDB } from "@/lib/db/mongoose";
import { Prediction, RaceResult, Score } from "@/lib/models";
import { calculateScore } from "@/lib/scoring";
import type { Types } from "mongoose";

export async function recalculateScoresForGP(grandPrixId: string): Promise<void> {
  await connectDB();

  const result = await RaceResult.findOne({ grandPrix: grandPrixId }).lean();
  if (!result) return;

  const predictions = await Prediction.find({ grandPrix: grandPrixId }).lean();
  if (predictions.length === 0) return;

  const resultPodium = {
    p1: (result.p1 as Types.ObjectId).toString(),
    p2: (result.p2 as Types.ObjectId).toString(),
    p3: (result.p3 as Types.ObjectId).toString(),
  };

  const ops = predictions.map((pred) => {
    const predPodium = {
      p1: (pred.p1 as Types.ObjectId).toString(),
      p2: (pred.p2 as Types.ObjectId).toString(),
      p3: (pred.p3 as Types.ObjectId).toString(),
    };

    const { points, breakdown } = calculateScore(predPodium, resultPodium);

    return {
      updateOne: {
        filter: {
          user: pred.user,
          tournament: pred.tournament,
          grandPrix: pred.grandPrix,
        },
        update: { $set: { points, breakdown } },
        upsert: true,
      },
    };
  });

  await Score.bulkWrite(ops);
}
