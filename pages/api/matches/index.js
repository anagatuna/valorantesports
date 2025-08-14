// pages/api/matches/index.js
import dbConnect from '@/lib/dbConnect';
import Match from '@/models/match';

export default async function handler(req, res) {
  await dbConnect();

  if (req.method === 'GET') {
    const matches = await Match.find().sort({ time: -1 });
    return res.status(200).json(matches);
  }

  if (req.method === 'POST') {
    try {
      const match = await Match.create(req.body);
      return res.status(201).json(match);
    } catch (error) {
      return res.status(400).json({ error: 'Error creating match' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
