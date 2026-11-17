/**
 * Classes d'un bloc qui apparaît au défilement, avec l'attribut `data-reveal`
 * (voir `RevealObserver`). Fichier sans « use client » : la constante doit
 * rester une chaîne dans les composants serveur.
 */
export const REVEAL_CLASSES =
  "transition-[opacity,translate] duration-500 ease-out data-[revealed=false]:translate-y-2 data-[revealed=false]:opacity-0";
