import { Schema, model, models, type Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  emailVerified: boolean;
  favoriteDriverCode?: string; // e.g. "VER" — headshot_url fetched from Driver model
  favoriteDriverHeadshot?: string; // cached URL so we don't need a join on every render
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    favoriteDriverCode: { type: String, uppercase: true },
    favoriteDriverHeadshot: { type: String },
  },
  { timestamps: true, collection: "user" }
);

export const User = models.User ?? model<IUser>("User", UserSchema);
