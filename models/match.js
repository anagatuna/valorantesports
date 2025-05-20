import mongoose from 'mongoose';

const MatchSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // id del partido
  time: String,
  team1: {
    name: String,
    score: Number,
  },
  team2: {
    name: String,
    score: Number,
  },
  event: {
    name: String,
    logo: String,
  },
  status: String
});

// Evitar redefinir el modelo si ya existe (en desarrollo)
export default mongoose.models.Match || mongoose.model('Match', MatchSchema);
