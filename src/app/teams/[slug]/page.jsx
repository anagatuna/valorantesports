export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTeamBySlug, getInitials } from '@/lib/teams';
import { getTeamMatches } from '@/lib/teamMatches';
import { REGION_LOGOS } from '@/lib/regionLogos';
import { TEAM_LOGO_TONE } from '@/lib/teamLogoTone';
import RegionTabs from '@/components/RegionTabs';
import BackLink from '@/components/BackLink';

// La misma que usa ScheduleCard. Fija a propósito: formatear en el huso del
// visitante haría que el HTML del servidor y el del cliente no coincidan.
const TIMEZONE = 'America/Mexico_City';

const fmt = (ts, opts) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, ...opts }).format(ts);
  } catch {
    return '';
  }
};

const fmtTime = (ts) => fmt(ts, { hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDay = (ts) => fmt(ts, { month: 'long', day: 'numeric' });
const fmtZone = (ts) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'short' })
      .formatToParts(ts).find(p => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
};

/** Rótulo vertical con su filete, como los del cliente. */
function RailLabel({ children }) {
  return (
    <div className="hidden shrink-0 items-stretch gap-3 md:flex" aria-hidden="true">
      <span className="w-px bg-gradient-to-b from-transparent via-white/25 to-transparent" />
      <span className="tlabel-v font-[family-name:var(--font-mark)] text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
        {children}
      </span>
    </div>
  );
}

function TeamTag({ team, dim = false }) {
  return (
    <span
      className={
        'font-[family-name:var(--font-mark)] text-lg font-bold uppercase tracking-wide ' +
        (dim ? 'text-white/70' : 'text-white')
      }
    >
      {team.tag || team.name}
    </span>
  );
}

/** Fila de partido del panel derecho: hora, marcador o "vs", y fecha. */
function MatchRow({ match, self, done }) {
  const row = (
    <>
      {/* El logo del rival sangra por el borde derecho, como en el cliente. */}
      {match.rival.logo && (
        <img
          src={match.rival.logo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-3 top-1/2 h-[135%] w-auto -translate-y-1/2 opacity-[0.12] grayscale"
        />
      )}

      <div className="relative flex items-baseline justify-between gap-3">
        <span className="font-[family-name:var(--font-mark)] text-[10px] uppercase tracking-[0.14em] text-white/45">
          {fmtTime(match.ts)} {fmtZone(match.ts)}
        </span>
        {/* La fecha va en caja mixta, como en el cliente: es el único dato de
            la fila que no es un código. */}
        <span className="font-[family-name:var(--font-mark)] text-[10px] tracking-[0.06em] text-white/40">
          {fmtDay(match.ts)}
        </span>
      </div>

      <div className="relative mt-1.5 flex items-center gap-2.5">
        <TeamTag team={self} />
        {done ? (
          <span className="font-[family-name:var(--font-mark)] text-lg font-bold tabular-nums text-white/80">
            {match.self.score}<span className="mx-1 text-white/30">–</span>{match.rival.score}
          </span>
        ) : (
          <span className="font-[family-name:var(--font-mark)] text-[11px] font-bold uppercase tracking-[0.1em] text-[#ff4655]">
            vs
          </span>
        )}
        <TeamTag team={match.rival} dim />
      </div>
    </>
  );

  const className =
    'group relative block overflow-hidden border-l-2 border-white/10 bg-black/35 px-4 py-3 ' +
    'transition hover:border-[#ff4655] hover:bg-black/50';

  // Sólo enlazamos si el rival está en nuestra base; si no, la ficha no existe.
  return match.rival.slug ? (
    <Link href={`/teams/${match.rival.slug}`} className={className}>{row}</Link>
  ) : (
    <div className={className}>{row}</div>
  );
}

function PlayerCard({ player }) {
  return (
    <li
      className={
        'group relative flex h-[330px] w-[152px] shrink-0 flex-col justify-end overflow-hidden ' +
        'bg-[#0f1215] border-b-[3px] ' +
        (player.isInactive ? 'border-white/25 opacity-70' : 'border-[#ff4655]')
      }
    >
      <span
        className={
          'absolute left-0 top-0 z-20 px-2 py-1 font-[family-name:var(--font-mark)] text-[9px] font-bold uppercase tracking-[0.14em] ' +
          (player.isPlayer && !player.isInactive
            ? 'bg-[#ff4655] text-white'
            : 'bg-black/70 text-white/80')
        }
      >
        {player.role}
      </span>

      {player.img ? (
        <img
          src={player.img}
          alt={player.nick}
          loading="lazy"
          className={
            'absolute inset-0 z-0 h-full w-full object-cover object-top ' +
            'transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.06]'
          }
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[26%] z-0 select-none text-center text-6xl font-black text-white/5"
        >
          {getInitials(player.nick)}
        </span>
      )}

      <div className="relative z-10 w-full bg-gradient-to-t from-[#0f1215] via-[#0f1215]/95 to-transparent px-3 pb-4 pt-14">
        <p className="truncate font-[family-name:var(--font-mark)] text-lg font-bold uppercase leading-none text-white">
          {player.nick}
        </p>
        {player.realName && (
          <p className="mt-1.5 truncate text-[11px] leading-tight text-[#ff4655]">
            {player.realName}
          </p>
        )}
      </div>
    </li>
  );
}

/** Fila de fichas con su rótulo vertical. Envuelve en vez de desplazarse. */
function RosterRow({ label, people }) {
  if (!people.length) return null;

  return (
    <section className="mt-5 flex gap-4">
      <RailLabel>{label}</RailLabel>

      <div className="min-w-0 flex-1">
        <p className="mb-3 font-[family-name:var(--font-mark)] text-[10px] uppercase tracking-[0.24em] text-white/40 md:hidden">
          {label}
        </p>
        <ul className="flex flex-wrap gap-2.5">
          {people.map(p => (
            <PlayerCard key={p.key || p.nick} player={p} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function TeamDetail({ params }) {
  const { slug } = await params;

  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const { upcoming, recent } = await getTeamMatches(team.name);

  // Los titulares primero y los suplentes detrás, pero en la misma fila: son
  // jugadores. El staff va en su propia fila, debajo.
  const members = team.players || [];
  const players = [
    ...members.filter(p => p.isPlayer && !p.isInactive),
    ...members.filter(p => p.isPlayer && p.isInactive),
  ];
  const staff = members.filter(p => !p.isPlayer);
  const roster = [...players, ...staff];

  // Sin próximos partidos el panel se quedaría vacío, así que enseñamos los
  // últimos resultados en su lugar.
  const showResults = upcoming.length === 0 && recent.length > 0;
  const rail = showResults ? recent : upcoming;

  const tone = TEAM_LOGO_TONE[team.slug];
  const description =
    team.description ||
    `Representando a la región de VCT ${team.region}, ${team.name} compite al más alto nivel en el VALORANT Champions Tour.`;

  return (
    <>
      {/* Las tabs de región se quedan como en el resto de la sección, con la
          del equipo ya marcada. */}
      <RegionTabs activeRegion={team.region} />

      <article className="min-w-0">
        <div className="mb-6">
          <BackLink href={team.region ? `/teams?region=${team.region}` : '/teams'} label="Teams" />
        </div>

        {/* ---- Cabecera ---- */}
        {/* El panel oscuro del cliente. El relleno lo pone `.tpanel` con un
            degradado que muere en los bordes: sin borde ni esquina, no se ve
            dónde acaba el recuadro. */}
        <section className="tpanel relative overflow-hidden p-7 md:p-9">
          {/* Marca de agua: el logo gigante, centrado en el panel. Es más alto
              que el panel a propósito; el `overflow-hidden` lo recorta por
              arriba y por abajo. */}
          {team.logo && (
            <img
              src={team.logo}
              alt=""
              aria-hidden="true"
              className={
                'tdetail__mark pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.07] ' +
                (tone ? 'tdetail__mark--lit' : '')
              }
            />
          )}

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {/* `.tdisplay` lleva la familia, el peso y la anchura. */}
              <h1 className="tdisplay text-6xl uppercase leading-[0.92] tracking-[0.005em] text-white md:text-7xl">
                {team.name}
              </h1>

              {REGION_LOGOS[team.region] && (
                <img
                  src={REGION_LOGOS[team.region]}
                  alt={`VCT ${team.region}`}
                  className="mt-4 h-8 w-auto object-contain"
                />
              )}

              <p className="mt-6 max-w-2xl text-sm leading-relaxed text-white/70">
                {description}
              </p>
            </div>

            {/* ---- Próximos partidos ---- */}
            {rail.length > 0 && (
              <aside className="flex gap-4">
                <RailLabel>{showResults ? 'Recent results' : 'Upcoming matches'}</RailLabel>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {/* En móvil no hay rótulo vertical, así que hace falta uno normal. */}
                  <p className="font-[family-name:var(--font-mark)] text-[10px] uppercase tracking-[0.24em] text-white/40 md:hidden">
                    {showResults ? 'Recent results' : 'Upcoming matches'}
                  </p>
                  {rail.map(m => (
                    <MatchRow key={m.id} match={m} self={team} done={showResults} />
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>

        {/* ---- Roster ---- */}
        {/* Jugadores y staff en filas separadas y con salto de línea: así no
            hace falta arrastrar el carrusel para llegar a los coaches. */}
        <RosterRow label="Team roster" people={players} />
        <RosterRow label="Coaching staff" people={staff} />

        {roster.length === 0 && (
          <p className="mt-6 text-sm text-white/50">
            No hay roster registrado para este equipo.
          </p>
        )}
      </article>
    </>
  );
}
