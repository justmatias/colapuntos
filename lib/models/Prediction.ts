import { Schema, model, models, type Document, type Types } from "mongoose";

export interface IPrediction extends Document {
  user: Types.ObjectId;
  tournament: Types.ObjectId;
  grandPrix: Types.ObjectId;
  p1: Types.ObjectId;
  p2: Types.ObjectId;
  p3: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PredictionSchema = new Schema<IPrediction>(
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
    p1: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    p2: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    p3: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  },
  { timestamps: true }
);

PredictionSchema.index(
  { user: 1, tournament: 1, grandPrix: 1 },
  { unique: true }
);

export const Prediction =
  models.Prediction ?? model<IPrediction>("Prediction", PredictionSchema);
