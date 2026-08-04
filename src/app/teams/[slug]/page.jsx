export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getTeamBySlug, getInitials } from '@/lib/teams';
import { REGION_LOGOS } from '@/lib/regionLogos';

function PlayerCard({ player }) {
  return (
    <li
      className={
        'group relative shrink-0 w-[168px] h-[400px] overflow-hidden ' +
        'bg-gradient-to-b from-[#3a1016] to-[#140609] ' +
        'border-b-[3px] ' +
        (player.isInactive ? 'border-white/25' : 'border-[#ff4655]')
      }
    >
      {player.img ? (
        <img
          src={player.img}
          alt={player.nick}
          loading='lazy'
          className='absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105'
        />
      ) : (
        <span
          aria-hidden='true'
          className='absolute inset-x-0 top-[26%] text-center text-6xl font-extrabold text-white/[0.07] select-none'
        >
          {getInitials(player.nick)}
        </span>
      )}

      <span
        className={
          'absolute top-0 left-0 z-10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider ' +
          (player.isPlayer ? 'bg-[#ff4655] text-white' : 'bg-black/70 text-white/80')
        }
      >
        {player.role}
      </span>

      <div className='absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 bg-gradient-to-t from-black via-black/85 to-transparent'>
        <p className='font-extrabold uppercase text-[15px] leading-tight truncate'>
          {player.nick}
        </p>
        {player.realName && (
          <p className='text-[11px] text-white/55 truncate mt-1'>{player.realName}</p>
        )}
      </div>
    </li>
  );
}

export default async function TeamDetail({ params }) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);

  if (!team) notFound();

  const players = team.players.filter(p => p.isPlayer);
  const staff = team.players.filter(p => !p.isPlayer);

  return (
    <article>
      <header className='relative rounded-2xl p-8 border border-white/10 bg-gradient-to-br from-[#611419] to-[#2a0810] shadow-xl overflow-hidden mb-8'>
        {team.logo && (
          <img
            src={team.logo}
            alt=''
            aria-hidden='true'
            className='absolute -right-6 top-1/2 -translate-y-1/2 w-56 h-56 object-contain opacity-10 pointer-events-none'
          />
        )}

        <div className='relative flex items-start gap-5'>
          {team.logo ? (
            <img
              src={team.logo}
              alt={team.name}
              className='w-20 h-20 object-contain shrink-0'
            />
          ) : (
            <div className='w-20 h-20 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white/40'>
              {getInitials(team.name)}
            </div>
          )}

          <div className='min-w-0'>
            <h1 className='text-4xl md:text-5xl font-extrabold uppercase leading-none break-words'>
              {team.name}
            </h1>
            <p className='flex items-center gap-2 mt-3 text-[#ff4655] font-bold uppercase tracking-wide text-sm'>
              {REGION_LOGOS[team.region] && (
                <img src={REGION_LOGOS[team.region]} alt='' className='w-5 h-5' aria-hidden='true' />
              )}
              VCT {team.region}
            </p>
          </div>
        </div>
      </header>

      {players.length > 0 && (
        <section className='mb-8'>
          <h2 className='text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4'>
            Roster
          </h2>
          <ul className='flex gap-3 overflow-x-auto pb-3'>
            {players.map(p => (
              <PlayerCard key={p.key} player={p} />
            ))}
          </ul>
        </section>
      )}

      {staff.length > 0 && (
        <section className='mb-8'>
          <h2 className='text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4'>
            Staff
          </h2>
          <ul className='flex gap-3 overflow-x-auto pb-3'>
            {staff.map(p => (
              <PlayerCard key={p.key} player={p} />
            ))}
          </ul>
        </section>
      )}

      {team.players.length === 0 && (
        <p className='text-white/50 text-sm'>
          No hay roster registrado para este equipo.
        </p>
      )}
    </article>
  );
}
