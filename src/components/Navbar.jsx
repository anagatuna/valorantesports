// src/components/Navbar.jsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Cierra el drawer cuando cambia la ruta
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquea scroll cuando drawer está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => (document.body.style.overflow = "");
  }, [open]);

  // Cierra con Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* NAV DESKTOP */}
      <nav className="valo-wrapper" aria-label="Main">
        <ul className="valo-bar">
          {/* Lado izquierdo */}
          <li className="valo-side left">
            <ul className="side-list">
              <li><Link href="/matches" className={isActive("/matches") ? "is-active" : undefined}>Matches</Link></li>
              <li><Link href="/events" className={isActive("/events") ? "is-active" : undefined}>Events</Link></li>
              <li><Link href="/results" className={isActive("/results") ? "is-active" : undefined}>Results</Link></li>
            </ul>
          </li>

          {/* Centro */}
          <li className="valo-center">
            <Link
              href="/"
              className={`play-chip${isActive("/") ? " is-active" : ""}`}
            >
              <span className="play-label">HOME</span>
            </Link>

          </li>

          {/* Lado derecho */}
          <li className="valo-side right">
            <ul className="side-list">
              <li><Link href="/teams" className={isActive("/teams") ? "is-active" : undefined}>Teams</Link></li>
              <li><Link href="/stats" className={isActive("/stats") ? "is-active" : undefined}>Stats</Link></li>
              <li><Link href="/pickems" className={isActive("/pickems") ? "is-active" : undefined}>Pick&apos;ems</Link></li>
            </ul>
          </li>
        </ul>
      </nav>

      {/* BURGER (solo móvil) */}
      <button
        className="valo-burger-fixed"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        aria-controls="valoDrawer"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span />
      </button>

      {/* DRAWER */}
      <aside
        id="valoDrawer"
        className={`valo-drawer ${open ? "is-open" : ""}`}
        aria-hidden={!open}
        onClick={() => setOpen(false)} // backdrop
      >
        <div className="drawer-panel" role="dialog" aria-label="Navigation" onClick={(e) => e.stopPropagation()}>
          <nav className="drawer-list">
            <Link href="/matches" className={isActive("/matches") ? "is-active" : undefined}>Matches</Link>
            <Link href="/events" className={isActive("/events") ? "is-active" : undefined}>Events</Link>
            <Link href="/results" className={isActive("/results") ? "is-active" : undefined}>Results</Link>
            <hr />
            <Link href="/teams" className={isActive("/teams") ? "is-active" : undefined}>Teams</Link>
            <Link href="/stats" className={isActive("/stats") ? "is-active" : undefined}>Stats</Link>
            <Link href="/pickems" className={isActive("/pickems") ? "is-active" : undefined}>Pick&apos;ems</Link>
          </nav>
        </div>
      </aside>
    </>
  );
}
