import { Schema, model, models, type Document, type Types } from "mongoose";

export interface ITournament extends Document {
  name: string;
  slug: string;
  season: number;
  inviteCode: string;
  creator: Types.ObjectId;
  members: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TournamentSchema = new Schema<ITournament>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    season: { type: Number, required: true },
    inviteCode: { type: String, required: true, unique: true },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const Tournament =
  models.Tournament ?? model<ITournament>("Tournament", TournamentSchema);
