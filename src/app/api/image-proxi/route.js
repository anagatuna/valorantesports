import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing URL', { status: 400 });
  }

  try {
    // 1. El servidor pide la imagen a VLR (o donde esté alojada)
    const response = await fetch(targetUrl, {
      headers: {
        // A veces ayuda fingir ser un navegador normal, aunque a menudo no es necesario
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!response.ok) throw new Error('Failed to fetch image');

    // 2. Convertimos la imagen a un formato que podamos devolver
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // 3. Devolvemos la imagen al navegador con caché agresivo
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable', // Guardar 24h
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    // Puedes devolver una imagen de placeholder transparente o gris aquí si falla
    return new NextResponse('Error fetching image', { status: 500 });
  }
}