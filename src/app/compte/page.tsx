import { ArrowRight, UserRound } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { getCurrentSession } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";

import { LogoutButton } from "../_components/logout-button";

export const metadata: Metadata = { title: "Mon compte" };

const ROLE_LABELS: Record<string, string> = {
  manager: "Gérant",
  waiter: "Serveur",
  prep: "Poste de préparation",
  courier: "Livreur",
  reader: "Lecteur",
};

/**
 * Accueil d'un membre du personnel. L'espace de l'établissement sera ouvert
 * ici dès que les appareils se synchronisent avec le serveur (voir
 * guides/walkthrough.md).
 */
export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Account />
      </Suspense>
      <div className="self-center">
        <ThemeSwitcher showLabels />
      </div>
    </main>
  );
}

async function Account() {
  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  if (session.user.mustChangePassword) redirect("/connexion/nouveau-mot-de-passe");
  if (session.user.isOwner) redirect("/proprietaire");

  const memberships = await getPrisma().membership.findMany({
    where: { userId: session.user.id, status: "active", establishment: { status: "active" } },
    include: { establishment: { select: { name: true, slug: true } } },
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-full bg-primary-subtle text-primary"
        >
          <UserRound className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">{session.user.displayName}</h1>
          <p className="text-sm text-text-muted">Connexion réussie.</p>
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {memberships.map((membership) => (
          <li key={membership.id}>
            <Link
              href={`/e/${membership.establishment.slug}/restaurant`}
              className="flex items-center justify-between gap-3 rounded-md bg-bg-subtle px-3 py-2 text-sm hover:bg-primary-subtle"
            >
              <span>
                {membership.establishment.name} · {ROLE_LABELS[membership.role] ?? membership.role}
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-text-muted">
        Sur le téléphone ou la tablette du restaurant, ouvrez l&apos;établissement : un gérant
        appaire l&apos;appareil une fois, puis chacun s&apos;y connecte avec son mot de passe et
        choisit son code PIN.
      </p>
      <div className="mt-5">
        <LogoutButton />
      </div>
    </div>
  );
}
