// src/models/Match.js
import mongoose from "mongoose";

/**
 * Team subdocument
 * - No genera _id para cada equipo (más limpio para arrays de 2)
 */
const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    country: { type: String, default: "", trim: true },
    score: { type: String, default: "-" }, // ej. "2", "1", "-" si no ha empezado
    short: { type: String, default: "", trim: true }, // opcional: tag (SEN, LEV, etc.)
    logo: { type: String, default: "" }, // opcional: ruta/URL logo
  },
  { _id: false }
);

/**
 * Match document
 * - `id`: ID externo del partido (de tu proveedor), único
 * - `in`: BO1/BO3/BO5 (dejas string para flexibilidad)
 */
const MatchSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true }, // ID externo
    teams: {
      type: [TeamSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: "El partido debe tener exactamente 2 equipos",
      },
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "canceled", "", null],
      default: "scheduled",
    },
    event: { type: String, default: "", trim: true },       // p.ej. "Week 1"
    tournament: { type: String, default: "", trim: true },  // p.ej. "VCT Americas"
    img: { type: String, default: "" },                     // imagen del evento/partido
    in: { type: String, default: "" },                      // "BO3", "BO5", etc.
    startTime: { type: Date },                              // opcional: fecha/hora inicio
    region: { type: String, default: "", trim: true },      // opcional: AMERICAS/EMEA...
    tier: { type: String, enum: ["T1", "T2", "GC", "", null], default: "" },
  },
  {
    timestamps: true,               // createdAt / updatedAt
    versionKey: false,              // sin __v
    minimize: true,                 // no guardar objetos vacíos
  }
);

/** Índices adicionales útiles para consultas comunes */
MatchSchema.index({ status: 1, startTime: 1 });
MatchSchema.index({ region: 1, startTime: 1 });
MatchSchema.index({ tournament: 1, startTime: 1 });

/** Evita recompilar el modelo en hot-reload de Next.js */
export default mongoose.models.Match || mongoose.model("Match", MatchSchema);
