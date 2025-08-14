import { NextResponse } from 'next/server';

export async function POST(req) {
  const formData = await req.formData();
  const region = (formData.get('region') || 'AMERICAS').toString();
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set('region', region, { path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
