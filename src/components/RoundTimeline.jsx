'use client';

import FallbackImg from '@/components/FallbackImg';

/**
 * Tira de rondas de un mapa: una fila por equipo, una columna por ronda.
 *
 * Lee match_maps.rounds, que el scraper rellena con lo que publica vlr.gg
 * (ver vlr_rounds.mjs y sql/005_match_rounds.sql):
 *
 *   { n, w: 1|2, side: "ct"|"t", how: "elim"|"defuse"|"boom"|"time", score }
 *
 * Solo se pinta el cuadro del equipo que GANO la ronda, con el color del lado
 * que jugaba: el otro se queda vacio. Asi de un vistazo se ven las rachas y en
 * que lado las hizo cada equipo, que es justo lo que el marcador CT/T resume
 * pero no deja ver.
 */

// Los mismos colores e iconos que usa vlr.gg, para que la lectura sea la que
// ya tiene aprendida cualquiera que venga de alli: verde defendiendo, rojo
// atacando. Los .png son los glifos blancos de vlr.gg guardados en public/,
// no un enlace a su CDN: pesan 2 KB cada uno y asi la tira no depende de que
// vlr.gg responda (nos devuelve 403 segun desde donde se pida).
const SIDE_BG = {
  ct: '#24b298',
  t: '#e25d5a',
};

const HOW = {
  elim: { icon: '/rondas/elim.png', label: 'Aniquilacion' },
  defuse: { icon: '/rondas/defuse.png', label: 'Spike desactivada' },
  boom: { icon: '/rondas/boom.png', label: 'Spike explotada' },
  time: { icon: '/rondas/time.png', label: 'Se acabo el tiempo' },
};

function HowIcon({ how, className = 'h-[15px] w-[15px]' }) {
  const meta = HOW[how];
  if (!meta) return null;
  return <img src={meta.icon} alt="" aria-hidden className={`${className} object-contain`} />;
}

/** Un cuadro: con color e icono si ese equipo gano la ronda, vacio si no. */
function Square({ round, team }) {
  if (!round || round.w !== team) {
    return <div className="h-6 w-6 shrink-0 rounded-[3px] bg-white/[0.14]" />;
  }

  const bg = SIDE_BG[round.side] || '#8f8f8f';
  const lado = round.side === 'ct' ? 'defendiendo' : round.side === 't' ? 'atacando' : null;

  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px]"
      style={{ backgroundColor: bg }}
      title={[`Ronda ${round.n}`, HOW[round.how]?.label, lado, round.score].filter(Boolean).join(' · ')}
    >
      <HowIcon how={round.how} />
    </div>
  );
}

/** Etiqueta de equipo a la izquierda, alineada con su fila de cuadros. */
function TeamLabel({ name, logo }) {
  return (
    <div className="flex h-6 items-center gap-2">
      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <FallbackImg sources={[logo]} alt="" className="max-h-[18px] max-w-[18px] object-contain" />
      </div>
      <span className="truncate text-[11px] font-bold uppercase tracking-wide text-white/85">{name}</span>
    </div>
  );
}

/**
 * Donde vlr.gg mete un hueco: tras la primera mitad (12) y tras el
 * reglamentario (24). No lo derivamos de los datos porque en prorroga las
 * rondas siguen numeradas de corrido y el corte es siempre el mismo.
 */
const BREAKS = new Set([12, 24]);

export default function RoundTimeline({ rounds, name1, name2, logo1, logo2 }) {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;

  const ordenadas = [...rounds].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));

  return (
    <div className="mt-1 flex gap-3">
      {/* Columna de etiquetas: el hueco de arriba iguala la fila de numeros. */}
      <div className="flex w-28 shrink-0 flex-col gap-1 pt-[17px]">
        <TeamLabel name={name1} logo={logo1} />
        <TeamLabel name={name2} logo={logo2} />
      </div>

      <div className="rondas-scroll min-w-0 flex-1 overflow-x-auto">
        <div className="flex w-max items-start gap-1">
          {ordenadas.map((r) => (
            <div key={r.n} className="contents">
              <div className="flex flex-col items-center gap-1">
                <span className="h-3 text-[10px] leading-3 text-white/40">{r.n}</span>
                <Square round={r} team={1} />
                <Square round={r} team={2} />
              </div>
              {BREAKS.has(r.n) && <div className="w-2.5 shrink-0" aria-hidden />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * La leyenda va aparte porque se pinta UNA vez por partido, no una por mapa:
 * repetirla debajo de cada tira era mas ruido que ayuda.
 */
export function RoundLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/45">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: SIDE_BG.ct }} />
        Defensa
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: SIDE_BG.t }} />
        Ataque
      </span>
      {Object.entries(HOW).map(([how, meta]) => (
        <span key={how} className="flex items-center gap-1.5">
          {/* Sobre fondo oscuro el glifo blanco se lee solo, sin el cuadro. */}
          <HowIcon how={how} className="h-3 w-3 opacity-70" />
          {meta.label}
        </span>
      ))}
    </div>
  );
}
