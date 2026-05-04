import { Schema, model, models, type Document, type Types } from "mongoose";

export interface IScore extends Document {
  user: Types.ObjectId;
  tournament: Types.ObjectId;
  grandPrix: Types.ObjectId;
  points: number;
  breakdown: {
    p1: number;
    p2: number;
    p3: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ScoreSchema = new Schema<IScore>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    grandPrix: {
      type: Schema.Types.ObjectId,
      ref: "GrandPrix",
      required: true,
    },
    points: { type: Number, required: true, default: 0 },
    breakdown: {
      p1: { type: Number, default: 0 },
      p2: { type: Number, default: 0 },
      p3: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

ScoreSchema.index({ user: 1, tournament: 1, grandPrix: 1 }, { unique: true });

export const Score = models.Score ?? model<IScore>("Score", ScoreSchema);
