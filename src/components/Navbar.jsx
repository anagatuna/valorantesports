// src/components/Navbar.jsx
"use client";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="valo-wrapper">
      <ul className="valo-bar">
        {/* Lado izquierdo */}
        <div className="valo-side left">
          <li><Link href="/matches">Matches</Link></li>
          <li><Link href="/events">Events</Link></li>
          <li><Link href="/results">Results</Link></li>
        </div>

        {/* Spacer invisible que ocupa el ancho del PLAY + hombros */}
        <li className="center-spacer" aria-hidden />

        {/* Lado derecho */}
        <div className="valo-side right">
          <li><Link href="/teams">Teams</Link></li>
          <li><Link href="/stats">Stats</Link></li>
          <li><Link href="/pickems">Pick'ems</Link></li>
        </div>

        {/* Botón PLAY (posicionado absoluto, arriba del spacer) */}
        <li className="valo-center">
          <Link href="/" className="play-chip"><span className="play-label">HOME</span></Link>
        </li>
      </ul>
    </nav>
  );
}
