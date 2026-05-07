import { Schema, model, models, type Document, type Types } from "mongoose";

export interface ISessionResult extends Document {
  grandPrix: Types.ObjectId;
  sessionKey: number;
  sessionName: string;
  sessionType: string;
  results: {
    position: number;
    driverNumber: number;
    code: string;
    fullName: string;
    team: string;
    teamColour?: string;
  }[];
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionResultSchema = new Schema<ISessionResult>(
  {
    grandPrix: { type: Schema.Types.ObjectId, ref: "GrandPrix", required: true },
    sessionKey: { type: Number, required: true, unique: true },
    sessionName: { type: String, required: true },
    sessionType: { type: String, required: true },
    results: [
      {
        position: { type: Number, required: true },
        driverNumber: { type: Number, required: true },
        code: { type: String, required: true },
        fullName: { type: String, required: true },
        team: { type: String, required: true },
        teamColour: { type: String },
      },
    ],
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

SessionResultSchema.index({ grandPrix: 1, sessionKey: 1 });

export const SessionResult =
  models.SessionResult ?? model<ISessionResult>("SessionResult", SessionResultSchema);
