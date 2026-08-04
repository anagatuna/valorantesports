export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getTeamBySlug, getInitials } from '@/lib/teams';
import { REGION_LOGOS } from '@/lib/regionLogos';
import RegionTabs from '@/components/RegionTabs';

function PlayerCard({ player }) {
  return (
    <li
      className={
        'group relative shrink-0 w-[168px] h-[360px] overflow-hidden flex flex-col justify-end ' +
        'bg-[#0f1215] ' + // El contenedor se queda quieto
        'border-b-[4px] cursor-pointer ' +
        (player.isInactive ? 'border-white/25 opacity-70' : 'border-[#ff4655]')
      }
    >
      {/* Etiqueta de Rol */}
      <span
        className={
          'absolute top-2 left-2 z-20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm transition-opacity duration-300 ' +
          (player.isPlayer ? 'bg-[#ff4655] text-white' : 'bg-black/60 text-white border border-white/10')
        }
      >
        {player.role}
      </span>

      {/* Imagen del jugador o Iniciales */}
      {player.img ? (
        <img
          src={player.img}
          alt={player.nick}
          loading='lazy'
          // Transición fluida, aumenta la escala, sube un poco, brilla más y añade sombra.
          className={
            'absolute inset-0 w-full h-full object-cover object-top z-0 ' +
            'transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ' +
            'group-hover:scale-[1.15] group-hover:-translate-y-2 group-hover:brightness-110 ' +
            'group-hover:drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)]'
          }
        />
      ) : (
        <span
          aria-hidden='true'
          className='absolute inset-x-0 top-[25%] text-center text-7xl font-black text-white/5 select-none z-0 transition-transform duration-500 group-hover:scale-110'
        >
          {getInitials(player.nick)}
        </span>
      )}

      {/* Nombres con degradado oscuro inferior */}
      <div className='relative z-10 w-full bg-gradient-to-t from-[#0f1215] via-[#0f1215]/90 to-transparent px-3 pt-12 pb-5 text-center'>
        <p className='font-black uppercase text-xl leading-none text-white truncate drop-shadow-md transition-colors duration-300 group-hover:text-[#ff4655]'>
          {player.nick}
        </p>
        {player.realName && (
          <p className='text-[11px] text-white/50 truncate mt-1 font-medium'>
            {player.realName}
          </p>
        )}
      </div>
    </li>
  );
}

export default async function TeamDetail({ params }) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);

  if (!team) notFound();

  const allMembers = team.players || [];
  
  const activePlayers = allMembers.filter(p => p.isPlayer && !p.isInactive);
  const subs = allMembers.filter(p => p.isPlayer && p.isInactive);
  const staff = allMembers.filter(p => !p.isPlayer);

  // Intentamos usar team.description. Si es nulo o vacío, mostramos un texto por defecto.
  const descriptionText = team.description || `Representando a la región de VCT ${team.region}, ${team.name} compite al más alto nivel en el VALORANT Champions Tour.`;

  return (
    <>
      {/* Pasamos la región del equipo para que se marque sola */}
      <RegionTabs activeRegion={team.region} />
      
      <article className='flex flex-col w-full'>
        <div className='flex-1 min-w-0 flex flex-col'>
          
          {/* Encabezado del Equipo */}
          <header className='relative z-10 mb-12'>
            <h1 className='text-5xl md:text-7xl font-black uppercase tracking-tight leading-none text-white'>
              {team.name}
            </h1>
            
            <div className='flex items-center gap-2 mt-4 text-[#ff4655] font-bold uppercase tracking-widest text-sm'>
              {REGION_LOGOS[team.region] && (
                <img src={REGION_LOGOS[team.region]} alt='' className='w-5 h-5' aria-hidden='true' />
              )}
              VCT {team.region}
            </div>

            {/* Renderizado dinámico de la descripción */}
            <p className='mt-6 text-sm text-white/80 leading-relaxed max-w-3xl'>
              {descriptionText}
            </p>
          </header>

          {/* Contenedor de todas las categorías de jugadores */}
          <div className='flex flex-col gap-10 mt-auto'>
            
            {/* SECCIÓN JUGADORES (TITULARES) */}
            {activePlayers.length > 0 && (
              <section className='relative z-10'>
                <h2 className='text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4 flex items-center gap-2'>
                  <span className='w-2 h-2 bg-[#ff4655] rounded-full inline-block'></span>
                  Jugadores Titulares
                </h2>
                <ul className='flex gap-4 overflow-x-auto pb-2 custom-scrollbar'>
                  {activePlayers.map((p) => (
                    <PlayerCard key={p.key || p.nick} player={p} />
                  ))}
                </ul>
              </section>
            )}

            {/* SECCIÓN SUSTITUTOS */}
            {subs.length > 0 && (
              <section className='relative z-10'>
                <h2 className='text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4 flex items-center gap-2'>
                  <span className='w-2 h-2 bg-gray-500 rounded-full inline-block'></span>
                  Sustitutos
                </h2>
                <ul className='flex gap-4 overflow-x-auto pb-2 custom-scrollbar'>
                  {subs.map((p) => (
                    <PlayerCard key={p.key || p.nick} player={p} />
                  ))}
                </ul>
              </section>
            )}

            {/* SECCIÓN STAFF / COACHES */}
            {staff.length > 0 && (
              <section className='relative z-10'>
                <h2 className='text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4 flex items-center gap-2'>
                  <span className='w-2 h-2 bg-white/20 rounded-full inline-block'></span>
                  Staff & Coaches
                </h2>
                <ul className='flex gap-4 overflow-x-auto pb-2 custom-scrollbar'>
                  {staff.map((p) => (
                    <PlayerCard key={p.key || p.nick} player={p} />
                  ))}
                </ul>
              </section>
            )}

            {allMembers.length === 0 && (
              <p className='text-white/50 text-sm pb-10'>
                No hay roster registrado para este equipo.
              </p>
            )}

          </div>
        </div>
      </article>
    </>
  );
}