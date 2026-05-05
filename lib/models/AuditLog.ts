import { Schema, model, models, type Document, type Types } from "mongoose";

export type AuditAction = "save_result" | "sync_result" | "remove_participant" | "regenerate_invite" | "save_retroactive_prediction" | "gp_cancelled" | "gp_uncancelled";

export interface IAuditLog extends Document {
  user: Types.ObjectId;
  tournament: Types.ObjectId;
  grandPrix?: Types.ObjectId;
  action: AuditAction;
  details: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    grandPrix: { type: Schema.Types.ObjectId, ref: "GrandPrix" },
    action: {
      type: String,
      enum: ["save_result", "sync_result", "remove_participant", "regenerate_invite", "save_retroactive_prediction", "gp_cancelled", "gp_uncancelled"],
      required: true,
    },
    details: { type: String, required: true },
  },
  { timestamps: true }
);

AuditLogSchema.index({ tournament: 1, createdAt: -1 });

export const AuditLog =
  models.AuditLog ?? model<IAuditLog>("AuditLog", AuditLogSchema);
