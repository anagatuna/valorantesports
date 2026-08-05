'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const REGIONS = [
  { id: 'ALL', label: 'ALL' },
  { id: 'AMERICAS', label: 'AMERICAS' },
  { id: 'EMEA', label: 'EMEA' },
  { id: 'PACIFIC', label: 'PACIFIC' },
  { id: 'CN', label: 'CN' },
];

// Cuánto sobresale el subrayado a cada lado del texto. Fijo y corto: en el
// cliente la barra abraza la palabra (SCHEDULE mide ~79px y su barra ~95px).
const OVERHANG = 28;
// El padding del nav va igualado al desborde a propósito: así el subrayado de
// los tabs de los extremos cae justo en el borde de la línea sin dejar de
// estar centrado bajo la palabra.
const LINE_PAD = OVERHANG;

export default function RegionTabs({ activeRegion = 'ALL' }) {
  // Copia local del activo para que el subrayado arranque a deslizarse en el
  // clic y no cuando el servidor conteste la navegación.
  const [current, setCurrent] = useState(activeRegion);
  const [bar, setBar] = useState(null);

  const navRef = useRef(null);
  const tabRefs = useRef({});

  useEffect(() => setCurrent(activeRegion), [activeRegion]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = tabRefs.current[current];
    if (!nav || !el) return;

    const measure = () => {
      // La caja del texto ya es simétrica gracias al padding-left.
      // Solo tomamos su posición y le sumamos el desborde (OVERHANG).
      const left = el.offsetLeft - OVERHANG;
      const right = el.offsetLeft + el.offsetWidth + OVERHANG;

      setBar({
        left: Math.max(0, left),
        width: Math.min(nav.offsetWidth, right) - Math.max(0, left),
      });
    };

    measure();

    // Las medidas cambian al cargar la tipografía y al redimensionar.
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [current]);

  return (
    // La línea la lleva el <nav>, no este contenedor: así mide lo que ocupan
    // las tabs y no todo el ancho de la página.
    <div className="mb-8 flex w-full justify-center">
      <nav
        ref={navRef}
        style={{ paddingLeft: LINE_PAD, paddingRight: LINE_PAD }}
        className="relative inline-flex items-center justify-center gap-8 border-b border-white/35 md:gap-12"
      >
        {REGIONS.map((tab) => {
          const isActive = current === tab.id;

          return (
            <Link
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              // Si clickean otra región mientras ven un equipo, los devuelve al grid de esa región
              href={tab.id === 'ALL' ? '/teams' : `/teams?region=${tab.id}`}
              onClick={() => setCurrent(tab.id)}
              className={
                // Cambiamos el margen negativo (-mr) por padding izquierdo (pl) 
                // del mismo tamaño exacto que el tracking.
                'relative pb-1.5 font-[family-name:var(--font-mark)] text-xs font-normal tracking-[0.12em] pl-[0.12em] uppercase transition-colors duration-300 ' +
                (isActive ? 'text-[var(--nav-accent)]' : 'text-white/70 hover:text-white')
              }
            >
              {tab.label}
            </Link>
          );
        })}

        {/* Un único subrayado que se desplaza, en vez de uno por tab. Sin
            medida todavía no se pinta, para que no salte desde la izquierda
            en el primer render. */}
        {bar && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-1px] h-[2px] bg-[var(--nav-accent)] transition-[transform,width] duration-300 ease-out"
            style={{ width: bar.width, transform: `translateX(${bar.left}px)`, left: 0 }}
          />
        )}
      </nav>
    </div>
  );
}