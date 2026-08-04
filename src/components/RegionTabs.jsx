import Link from 'next/link';

const REGIONS = [
  { id: 'ALL', label: 'ALL' },
  { id: 'AMERICAS', label: 'AMERICAS' },
  { id: 'EMEA', label: 'EMEA' },
  { id: 'PACIFIC', label: 'PACIFIC' },
  { id: 'CN', label: 'CN' },
];

export default function RegionTabs({ activeRegion = 'ALL' }) {
  return (
    <div className="w-full border-b border-white/20 mb-8">
      <nav className="flex items-center justify-center gap-10 md:gap-16">
        {REGIONS.map((tab) => {
          const isActive = activeRegion === tab.id;
          
          return (
            <Link
              key={tab.id}
              // Si clickean otra región mientras ven un equipo, los devuelve al grid de esa región
              href={tab.id === 'ALL' ? '/teams' : `/teams?region=${tab.id}`}
              className={
                'relative pb-4 text-sm font-bold tracking-[0.2em] uppercase transition-colors ' +
                (isActive ? 'text-[#0fdbb5]' : 'text-white/50 hover:text-white')
              }
            >
              {tab.label}
              
              {isActive && (
                <span className="absolute left-0 bottom-[-1px] w-full h-[3px] bg-[#0fdbb5] shadow-[0_0_10px_rgba(15,219,181,0.6)]" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}