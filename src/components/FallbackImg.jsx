'use client';

import { useState } from 'react';

/**
 * <img> con cadena de respaldo.
 *
 * Los assets oficiales de Riot (static.lolesports.com) son mejores que los de
 * vlr.gg —mayor resolución, fondo consistente y la jersey de la temporada
 * actual— pero no siempre llegan: hay redes que filtran ese CDN y Riot mueve
 * o borra archivos cuando un equipo se renombra. Sin respaldo la tarjeta se
 * queda con el hueco de una imagen rota.
 *
 * Prueba las fuentes en orden y, si se agotan todas, pinta `fallbackText`
 * (las iniciales) o nada. Todo el estado vive aquí para que los llamadores
 * puedan seguir siendo componentes de servidor: las props son serializables,
 * sin callbacks.
 */
export default function FallbackImg({
  sources = [],
  fallbackText = null,
  fallbackClassName = '',
  ...props
}) {
  const urls = sources.filter(Boolean);
  const [i, setI] = useState(0);

  if (i >= urls.length) {
    return fallbackText
      ? <span className={fallbackClassName}>{fallbackText}</span>
      : null;
  }

  const siguiente = () => setI(n => (n === i ? n + 1 : n));

  return (
    <img
      {...props}
      src={urls[i]}
      onError={siguiente}
      // El <img> llega renderizado del servidor: si la descarga falla ANTES
      // de que React hidrate, el evento `error` ya pasó y onError no se
      // entera nunca. Al montar hay que preguntarle al elemento si ya
      // fracasó (complete con naturalWidth 0) y avanzar a mano.
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) siguiente();
      }}
    />
  );
}
