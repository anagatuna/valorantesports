import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing URL', { status: 400 });
  }

  try {
    // Engañamos al servidor diciendo que somos un navegador Chrome
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.vlr.gg/', // Clave para evitar el 403
      },
    });

    if (!response.ok) throw new Error('Failed to fetch');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'image/png');
    // Cacheamos la imagen 1 día para que cargue rápido
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    return new NextResponse(buffer, { status: 200, headers });

  } catch (error) {
    return new NextResponse('Error', { status: 500 });
  }
}