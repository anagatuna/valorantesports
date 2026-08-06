import Link from 'next/link';

/**
 * Enlace de regreso al estilo del sitio oficial: una flecha fina, "BACK //" en
 * gris y el destino en blanco. En hover solo cambia el color; nada se mueve.
 */
export default function BackLink({ href, label }) {
  return (
    <Link
      href={href}
      className='group inline-flex items-center gap-2.5 font-[family-name:var(--font-mark)] text-xs uppercase tracking-[0.16em] no-underline'
    >
      <svg
        aria-hidden='true'
        viewBox='0 0 16 24'
        className='w-4 h-6 shrink-0 text-white/40 transition-colors duration-300 group-hover:text-[#ff4655]'
      >
        {/* Chevron alto y en pico */}
        <path
          d='M14 2 L3 12 L14 22'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinejoin='miter'
        />
        {/* Guion corto: sale del vértice y muere dentro de la V, no llega al texto */}
        <path
          d='M4 12 H12'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          opacity='0.5'
        />
        {/* La crucecita va encima del guion, pegada al vértice */}
        <path
          d='M7 9.5 V14.5 M4 12 H10'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
        />
      </svg>

      <span className='text-white/45 transition-colors duration-300 group-hover:text-white/70'>
        Back //
      </span>
      <span className='font-bold text-white'>{label}</span>
    </Link>
  );
}
