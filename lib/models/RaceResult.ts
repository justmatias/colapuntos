import { Schema, model, models, type Document, type Types } from "mongoose";

export interface IRaceResult extends Document {
  grandPrix: Types.ObjectId;
  p1: Types.ObjectId;
  p2: Types.ObjectId;
  p3: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RaceResultSchema = new Schema<IRaceResult>(
  {
    grandPrix: {
      type: Schema.Types.ObjectId,
      ref: "GrandPrix",
      required: true,
      unique: true,
    },
    p1: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    p2: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    p3: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  },
  { timestamps: true }
);

export const RaceResult =
  models.RaceResult ?? model<IRaceResult>("RaceResult", RaceResultSchema);
