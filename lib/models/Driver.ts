import { Schema, model, models, type Document } from "mongoose";

export interface IDriver extends Document {
  season: number;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  number: number;
  team: string;
  teamColour?: string;
  headshotUrl?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema = new Schema<IDriver>(
  {
    season: { type: Number, required: true },
    code: { type: String, required: true, uppercase: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fullName: { type: String, required: true },
    number: { type: Number, required: true },
    team: { type: String, required: true },
    teamColour: { type: String },
    headshotUrl: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DriverSchema.index({ code: 1, season: 1 }, { unique: true });

export const Driver = models.Driver ?? model<IDriver>("Driver", DriverSchema);
