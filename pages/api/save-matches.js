import dbConnect from '@/lib/mongodb';
import Match from '@/models/Match';

export default async function handler(req, res) {
  await dbConnect();

  const response = await fetch('https://vlresports.vercel.app/api/matches');
  const data = await response.json();
  const matches = data.data;

  try {
    for (const match of matches) {
      await Match.updateOne(
        { id: match.id },
        { $set: match },
        { upsert: true }
      );
    }

    res.status(200).json({ message: 'Partidos guardados en MongoDB' });
  } catch (error) {
    console.error('Error al guardar:', error);
    res.status(500).json({ error: 'Ocurrió un error al guardar los partidos' });
  }
}
