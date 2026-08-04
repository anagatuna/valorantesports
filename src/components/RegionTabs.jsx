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

// Cuánto del hueco entre tabs ocupa el subrayado por cada lado. Medido contra
// la referencia: con 0.8 (llegar justo antes del texto vecino) la barra queda
// desproporcionada bajo las palabras cortas.
const OVERHANG_RATIO = 0.4;
const MIN_OVERHANG = 8;

export default function RegionTabs({ activeRegion = 'ALL' }) {
  // Copia local del activo para que el subrayado arranque a deslizarse en el
  // clic y no cuando el servidor conteste la navegación.
  const [current, setCurrent] = useState(activeRegion);
  const [bar, setBar] = useState(null);
  // El desborde se deriva del hueco real entre tabs, así que se adapta al
  // breakpoint (el gap cambia en md) sin números a mano.
  const [overhang, setOverhang] = useState(24);

  const navRef = useRef(null);
  const tabRefs = useRef({});

  useEffect(() => setCurrent(activeRegion), [activeRegion]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = tabRefs.current[current];
    if (!nav || !el) return;

    const measure = () => {
      const els = REGIONS.map((r) => tabRefs.current[r.id]).filter(Boolean);
      if (els.length < 2) return;

      // El tracking deja un hueco tras la última letra de cada tab; hay que
      // descontarlo o todo sale corrido hacia la derecha.
      const trailingOf = (n) => parseFloat(getComputedStyle(n).letterSpacing) || 0;

      // Hueco visible entre el texto de un tab y el del siguiente.
      const gap = els[1].offsetLeft - (els[0].offsetLeft + els[0].offsetWidth - trailingOf(els[0]));
      const oh = Math.max(MIN_OVERHANG, Math.round(gap * OVERHANG_RATIO));
      setOverhang(oh);

      // Con el padding del nav igualado a `oh`, los tabs de los extremos caen
      // justo en el borde de la línea sin necesidad de tratarlos aparte.
      const left = el.offsetLeft - oh;
      const right = el.offsetLeft + el.offsetWidth - trailingOf(el) + oh;
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
  }, [current, overhang]);

  return (
    // La línea la lleva el <nav>, no este contenedor: así mide lo que ocupan
    // las tabs y no todo el ancho de la página.
    <div className="mb-8 flex w-full justify-center">
      <nav
        ref={navRef}
        style={{ paddingLeft: overhang, paddingRight: overhang }}
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
                // El -mr compensa el hueco que tracking deja tras la última letra.
                'relative pb-1.5 text-xs font-medium tracking-[0.18em] -mr-[0.18em] uppercase transition-colors duration-300 ' +
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
            className="pointer-events-none absolute bottom-[-1px] h-[2px] bg-[var(--nav-accent)] shadow-[0_0_6px_rgba(55,230,217,0.45)] transition-[transform,width] duration-300 ease-out"
            style={{ width: bar.width, transform: `translateX(${bar.left}px)`, left: 0 }}
          />
        )}
      </nav>
    </div>
  );
}
