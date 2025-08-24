// src/models/Match.js
import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, trim: true },
    country:{ type: String, default: "", trim: true },
    score:  { type: String, default: "-" }, // "2", "1" o "-"
    short:  { type: String, default: "", trim: true },
    logo:   { type: String, default: "" },
  },
  { _id: false }
);

const MatchSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    // ⚠️ SOLO una definición de teams
    teams:      {
      type: [TeamSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: "El partido debe tener exactamente 2 equipos",
      },
      required: true,
    },

    status: { type: String, index: true }, // LIVE | UPCOMING | COMPLETED

    // tiempos normalizados
    startTs:    { type: Number, index: true }, // timestamp (ms) para ordenar
    startTime:  { type: Date },                // si viene ISO
    time_unix:  Number,
    unix:       Number,
    date_iso:   String,
    time:       String,
    time_str:   String,
    in:         { type: String, default: "" }, // "2h 5m", "1d 3h", etc.

    // metadatos
    name:       String,
    event:      { type: String, default: "", trim: true },
    tournament: { type: String, default: "", trim: true },
    img:        { type: String, default: "" },
    region:     { type: String, default: "", trim: true },
    tier:       { type: String, enum: ["T1", "T2", "GC", ""], default: "" },
  },
  {
    timestamps: true,
    strict: false,
    versionKey: false,
    minimize: true,
  }
);

MatchSchema.index({ status: 1, startTs: 1 });
MatchSchema.index({ tournament: 1, startTs: 1 });
MatchSchema.index({ region: 1, startTs: 1 });

export default mongoose.models.Match || mongoose.model("Match", MatchSchema);
