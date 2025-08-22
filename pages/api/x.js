// pages/api/refresh.js
//import dbConnect from '../../src/lib/dbConnect';
//import Match from '../../models/match';
//
//export default async function handler(req, res) {
//  if (req.query.key !== process.env.REFRESH_SECRET) {
//    return res.status(401).json({ error: 'Not authorized' });
//  }
//
//  await dbConnect();
//
//  const response = await fetch('https://vlr.orlandomm.net/api/v1/matches');
//  const { data } = await response.json();
//
//  for (const match of data) {
//    await Match.updateOne({ id: match.id }, { $set: match }, { upsert: true });
//  }
//
//  res.status(200).json({ message: 'Matches updated' });
//}
