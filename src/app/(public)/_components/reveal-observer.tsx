"use client";

import { useEffect } from "react";

/**
 * Apparition au défilement (docs/LANDING_PAGE.md § 4) : fondu et translation
 * de 8px, une seule fois. Seuls les blocs encore hors de l'écran au
 * chargement sont masqués, et seulement par ce script : sans JavaScript, ou
 * avec `prefers-reduced-motion`, tout reste visible, sans animation.
 *
 * Les blocs concernés portent `data-reveal` et les classes de `REVEAL_CLASSES`
 * (`reveal.ts`).
 */
export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "true");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    for (const element of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute("data-revealed", "false");
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
