import { LogOut } from "lucide-react";

import { Button } from "@/shared/ui/button";

import { logoutAction } from "../connexion/actions";

/** Déconnexion : la session est révoquée côté serveur, le cookie supprimé. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm">
        <LogOut aria-hidden />
        {/* Sur téléphone, l'icône seule ; le libellé reste lu par les lecteurs d'écran. */}
        <span className="max-sm:sr-only">Se déconnecter</span>
      </Button>
    </form>
  );
}
