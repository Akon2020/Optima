import type { Metadata } from "next";

import { LaunchRedirect } from "./launch-redirect";

export const metadata: Metadata = { title: "Ouverture" };

/**
 * Point d'entrée de l'application installée (manifeste, `start_url`) : reprend
 * le dernier établissement ouvert sur l'appareil, même hors connexion ; sinon
 * la page de connexion. Statique et précachée.
 */
export default function LaunchPage() {
  return <LaunchRedirect />;
}
