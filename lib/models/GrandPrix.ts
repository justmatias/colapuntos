import { Schema, model, models, type Document } from "mongoose";

export type GPStatus = "upcoming" | "open" | "closed" | "completed";

export interface IGrandPrix extends Document {
  season: number;
  round: number;
  name: string;
  country: string;
  circuit: string;
  timezone: string;
  raceDate: Date;
  predictionDeadline: Date;
  status: GPStatus;
  cancelled?: boolean;
  meetingKey?: number;
  raceSessionKey?: number;
  qualifyingSessionKey?: number;
  sprintSessionKey?: number;
  countryFlag?: string;
  circuitImage?: string;
  gmtOffset?: string;
  weatherCondition?: "dry" | "wet" | "mixed";
  createdAt: Date;
  updatedAt: Date;
}

const GrandPrixSchema = new Schema<IGrandPrix>(
  {
    season: { type: Number, required: true },
    round: { type: Number, required: true },
    name: { type: String, required: true },
    country: { type: String, required: true },
    circuit: { type: String, required: true },
    timezone: { type: String, required: true },
    raceDate: { type: Date, required: true },
    predictionDeadline: { type: Date, required: true },
    status: {
      type: String,
      enum: ["upcoming", "open", "closed", "completed"],
      default: "upcoming",
    },
    cancelled: { type: Boolean, default: false },
    meetingKey: { type: Number },
    raceSessionKey: { type: Number },
    qualifyingSessionKey: { type: Number },
    sprintSessionKey: { type: Number },
    countryFlag: { type: String },
    circuitImage: { type: String },
    gmtOffset: { type: String },
    weatherCondition: { type: String, enum: ["dry", "wet", "mixed"] },
  },
  { timestamps: true }
);

GrandPrixSchema.index({ season: 1, round: 1 }, { unique: true });

export const GrandPrix =
  models.GrandPrix ?? model<IGrandPrix>("GrandPrix", GrandPrixSchema);
