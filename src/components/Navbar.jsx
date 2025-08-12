// src/components/Navbar.jsx
"use client";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="valo-wrapper">
      <ul className="valo-bar">
        {/* Lado izquierdo */}
        <div className="valo-side left">
          <li><Link href="/">Inicio</Link></li>
          <li><Link href="/matches">Partidos</Link></li>
          <li><Link href="/teams">Equipos</Link></li>
        </div>

        {/* 🔸 Spacer invisible que ocupa el ancho del PLAY + hombros */}
        <li className="center-spacer" aria-hidden />

        {/* Lado derecho */}
        <div className="valo-side right">
          <li><Link href="/tournaments">Torneos</Link></li>
          <li><Link href="/stats">Stats</Link></li>
          <li><Link href="/store">Tienda</Link></li>
        </div>

        {/* Botón PLAY (posicionado absoluto, arriba del spacer) */}
        <li className="valo-center">
          <Link href="/play" className="play-chip">PLAY</Link>
        </li>
      </ul>
    </nav>
  );
}
