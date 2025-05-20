import mongoose from 'mongoose';

const TeamSchema = new mongoose.Schema({
  name: String,
  country: String,
  score: String
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // ID del partido desde la API externa
  teams: [TeamSchema], // Arreglo con 2 equipos
  status: String,
  event: String,
  tournament: String,
  img: String,
  in: String
});

// Evitar error por recompilar modelo en desarrollo
export default mongoose.models.Match || mongoose.model('Match', MatchSchema);
