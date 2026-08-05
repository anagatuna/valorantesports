'use client';

import Link from 'next/link';
import { useRef } from 'react';

// Inclinación máxima en cada eje. Más de ~10° y el logo se deforma en las
// esquinas de la cuadrícula.
const MAX_TILT = 7;

export default function TeamCard({ team, initials }) {
  const ref = useRef(null);

  const handleMove = (e) => {
    // En táctil no hay hover: el "tilt" se quedaría congelado tras el tap.
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;

    // El borde más cercano al cursor se acerca, el opuesto se hunde.
    el.style.setProperty('--ry', `${(px - 0.5) * 2 * MAX_TILT}deg`);
    el.style.setProperty('--rx', `${-(py - 0.5) * 2 * MAX_TILT}deg`);
    el.dataset.tilt = 'on';
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    // Al salir devolvemos la carta al plano; el CSS alarga la transición para
    // que vuelva con calma en vez de saltar.
    delete el.dataset.tilt;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <Link
      ref={ref}
      href={`/teams/${team.slug}`}
      className="tcard"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="tcard__plane">
        {/* Sombra de suelo, por detrás de todo en el espacio 3D. */}
        <span className="tcard__cast" aria-hidden="true" />

        {/* El relleno y el borde van separados a propósito. Si el borde fuera
            un rectángulo lleno tapado por el relleno, su color claro se vería
            por debajo (el relleno es translúcido) y agrisaría la carta. */}
        <div className="tcard__panel" aria-hidden="true">
          <span className="tcard__bar" />
        </div>
        <span className="tcard__edge" aria-hidden="true" />

        {/* El logo flota por delante del panel: es lo que vende el relieve. */}
        <span className="tcard__logo">
          <span className="tcard__drop" aria-hidden="true" />
          {team.logo ? (
            <img src={team.logo} alt={team.name} className="tcard__img" />
          ) : (
            <span className="tcard__img tcard__initials">{initials}</span>
          )}
        </span>

        <span className="tcard__name">{team.name}</span>
      </div>
    </Link>
  );
}
