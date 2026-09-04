import Link from 'next/link';
import FallbackImg from '@/components/FallbackImg';
import { TEAM_LOGO_TONE } from '@/lib/teamLogoTone';

/**
 * Tarjeta de equipo con el lenguaje del selector de cola del cliente: tile
 * apaisado, el arte sangrando por la derecha, el nombre abajo a la izquierda
 * sobre el degradado y un riel fino por debajo.
 */
export default function TeamCard({ team, initials }) {
  // Los logos que vienen en negro plano hay que aclararlos o no se ven.
  const tone = TEAM_LOGO_TONE[team.slug];

  // El oficial de Riot primero, el de vlr.gg detrás. Cuál se usa lo decide el
  // navegador según cuál cargue: ver FallbackImg.
  const fuentes = team.logos?.length ? team.logos : [team.logo].filter(Boolean);

  return (
    <Link href={`/teams/${team.slug}`} className="tcard">
      <div className="tcard__tile">
        {/* El "arte" del tile: el propio logo, gigante y desaturado. Es lo
            único que tenemos por equipo, así que hace de fondo y de retrato. */}
        <FallbackImg
          sources={fuentes}
          alt=""
          aria-hidden="true"
          className={`tcard__ghost${tone ? ' tcard__ghost--lit' : ''}`}
        />

        {/* Oscurece la esquina del texto sin apagar el logo de la derecha. */}
        <span className="tcard__scrim" aria-hidden="true" />

        <span className="tcard__logo">
          <FallbackImg
            sources={fuentes}
            alt=""
            className={`tcard__img${tone ? ` tcard__img--${tone}` : ''}`}
            fallbackText={initials}
            fallbackClassName="tcard__initials"
          />
        </span>

        <span className="tcard__body">
          <span className="tcard__name">{team.name}</span>
        </span>

        {/* Borde: sólo se enciende al apuntar, como el tile seleccionado del
            juego. */}
        <span className="tcard__edge" aria-hidden="true" />
      </div>

      <span className="tcard__rail" aria-hidden="true">
        <i />
      </span>
    </Link>
  );
}
