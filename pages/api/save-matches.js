import dbConnect from '@/lib/dbConnect';
import Match from '@/models/Match';

export async function guardarMatchesDesdeAPI() {
  await dbConnect();

  const res = await fetch('https://vlr.orlandomm.net/api/v1/matches');
  const json = await res.json();
  const matches = json.data;

  for (const match of matches) {
    try {
      await Match.updateOne(
        { id: match.id },
        { $set: match },
        { upsert: true } // inserta si no existe
      );
    } catch (err) {
      console.error(`Error guardando el match ${match.id}:`, err);
    }
  }
}
