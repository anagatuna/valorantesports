"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Fondo de mapa de las cards. Dos redes de seguridad:
 *  - src null (mapa desconocido) -> no renderiza nada.
 *  - el archivo no existe en public/maps -> onError lo oculta.
 *
 * La segunda cubre el caso de agregar la entrada a MAP_IMAGES pero olvidar
 * subir el .webp: en vez de un 404 mudo, la card queda simplemente sin fondo.
 */
export default function MapBackground({ src, alt, sizes, style }) {
  const [failed, setFailed] = useState(false);

  // Al cambiar de mapa hay que volver a intentar: si no, un mapa sin archivo
  // dejaria ocultos a todos los siguientes.
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) return null;

  return (
    <div className="sched__bg" aria-hidden="true" style={style}>
      <div className="sched__center">
        <Image
          src={src}
          alt={alt || "map"}
          fill
          priority={false}
          className="sched__center-img"
          sizes={sizes}
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  );
}
