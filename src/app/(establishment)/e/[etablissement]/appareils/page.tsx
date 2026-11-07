import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { DomainError } from "@/shared/lib/errors";
import { buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { ModuleScope } from "@/shared/theme/module-scope";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { getCurrentSession } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";
import { listDevices } from "@/server/sync/devices";

import { LogoutButton } from "../../../../_components/logout-button";

import { DevicesScreen } from "./_components/devices-screen";

export const metadata: Metadata = { title: "Appareils" };

/**
 * Appareils d'un établissement (EF-CPT-04), pour le gérant et le propriétaire.
 * Écran en ligne, protégé par la session web : l'accès est vérifié côté
 * serveur par `authorize` (CLAUDE.md § 3.3), pas par le menu.
 */
export default function DevicesPage({ params }: PageProps<"/e/[etablissement]/appareils">) {
  return (
    <Suspense fallback={<Frame backHref="/compte">{<Skeleton className="h-64" />}</Frame>}>
      <Devices params={params} />
    </Suspense>
  );
}

async function Devices({ params }: { params: Promise<{ etablissement: string }> }) {
  // Écran propre à chaque requête (session, heure) : jamais prérendu.
  await connection();
  const { etablissement: slug } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  if (session.user.mustChangePassword) redirect("/connexion/nouveau-mot-de-passe");
  if (session.user.isOwner && !session.user.totpEnabledAt) redirect("/connexion/activer-2fa");
  if (session.user.isOwner && !session.isElevated) redirect("/connexion/double-authentification");
  const backHref = session.user.isOwner ? "/proprietaire" : "/compte";

  const db = getPrisma();
  const establishment = await db.establishment.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!establishment) notFound();

  let result: Awaited<ReturnType<typeof listDevices>> | null = null;
  let denied: string | null = null;
  try {
    result = await listDevices(
      db,
      { userId: session.user.id, isOwner: session.user.isOwner, isElevated: session.isElevated },
      { establishmentId: establishment.id },
    );
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    denied = error.message;
  }

  // Lu dans le contexte RLS de l'établissement, après autorisation.
  const hasRestaurant = result?.establishment.enabledModules.includes("restaurant") ?? false;
  const content = (
    <Frame backHref={backHref} title={establishment.name}>
      {result ? (
        <DevicesScreen
          slug={slug}
          timeZone={result.establishment.timeZone}
          nowIso={new Date().toISOString()}
          devices={result.devices}
          pairingPath={hasRestaurant ? `/e/${slug}/restaurant` : null}
        />
      ) : (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Accès réservé au gérant"
            description={denied ?? "Vous n'avez pas accès à cet écran."}
          />
        </Card>
      )}
    </Frame>
  );
  // D-017 : la charte Restaurant couvre tout l'espace d'un établissement dont le module est actif.
  return hasRestaurant ? <ModuleScope module="restaurant">{content}</ModuleScope> : content;
}

function Frame({
  backHref,
  title,
  children,
}: {
  backHref: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href={backHref} className={buttonClasses("ghost", "sm", "-ml-2")}>
            <ArrowLeft aria-hidden />
            Retour
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold">Appareils</h1>
        <p className="mt-1 text-sm text-text-muted">
          {title ? `${title} · ` : ""}téléphones et tablettes appairés. Un appareil perdu, volé ou
          remplacé se révoque ici.
        </p>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
