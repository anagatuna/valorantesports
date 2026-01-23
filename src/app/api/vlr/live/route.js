import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get('id'); // ID del partido (ej: 12345)

  if (!matchId) return new NextResponse('Missing ID', { status: 400 });

  try {
    // VLR usa este endpoint interno para actualizar sus propios marcadores
    // Es muy ligero y rápido.
    const url = `https://www.vlr.gg/match/score/${matchId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.vlr.gg/${matchId}`,
        'X-Requested-With': 'XMLHttpRequest' // Importante para que VLR responda JSON
      },
      next: { revalidate: 10 } // Cachear solo 10 segundos en Vercel
    });

    if (!response.ok) throw new Error('VLR Error');

    const data = await response.json();
    
    // La respuesta de VLR suele ser compleja, devolvemos el JSON crudo
    // para procesarlo en el frontend.
    return NextResponse.json(data);

  } catch (error) {
    return new NextResponse(JSON.stringify({ error: 'Failed to fetch live score' }), { status: 500 });
  }
}