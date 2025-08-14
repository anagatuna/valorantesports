// pages/api/matches/[id].js
import dbConnect from '@/lib/dbConnect';
import Match from '@/models/match';

export default async function handler(req, res) {
  await dbConnect();

  const { id } = req.query;

  if (req.method === 'GET') {
    const match = await Match.findOne({ id });
    return res.status(200).json(match);
  }

  if (req.method === 'PUT') {
    const match = await Match.findOneAndUpdate({ id }, req.body, { new: true });
    return res.status(200).json(match);
  }

  if (req.method === 'DELETE') {
    await Match.deleteOne({ id });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
