// src/components/HtmlAttributeGuard.jsx
"use client";

import { useEffect } from "react";

export default function HtmlAttributeGuard() {
  useEffect(() => {
    const html = document.documentElement;
    const allowed = new Set(["lang"]); // atributos permitidos en <html>

    // Limpieza inicial
    for (const attr of Array.from(html.attributes)) {
      if (!allowed.has(attr.name)) html.removeAttribute(attr.name);
    }

    // Vigila en caliente por si alguna extensión vuelve a inyectar atributos
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target === html) {
          const name = m.attributeName;
          if (name && !allowed.has(name)) html.removeAttribute(name);
        }
      }
    });
    obs.observe(html, { attributes: true });

    return () => obs.disconnect();
  }, []);

  return null;
}
