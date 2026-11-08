"use client";

import {
  Calculator,
  FlaskConical,
  PackageX,
  KeyRound,
  Menu,
  RotateCcw,
  Search,
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { Avatar } from "@/shared/ui/avatar";
import { CountBadge } from "@/shared/ui/badge";
import { Button, IconButton, buttonClasses } from "@/shared/ui/button";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { Sheet } from "@/shared/ui/sheet";
import { ModuleScope } from "@/shared/theme/module-scope";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { useDayData } from "../../offline/hooks";
import { LinkUserForm } from "../device/link-user-form";
import { PairingScreen } from "../device/pairing-screen";
import { UserGate } from "../device/user-gate";
import { orderPrepStatus } from "../../domain/dashboard";
import { RestaurantProvider, useRestaurant } from "../restaurant-provider";
import {
  NAV_ITEMS,
  enabledNavItems,
  isNavItemActive,
  navItemForPath,
  navItemModule,
  restaurantHref,
} from "./nav-items";
import { SyncStatus } from "./sync-status";

/**
 * Coquille du module Restaurant (docs/DESIGN_SYSTEM.md § 5.5 et § 6) :
 * barre latérale fixe à partir de `lg`, tiroir et barre d'onglets inférieure
 * en dessous. La charte Restaurant est portée par <ModuleScope>.
 */
export function RestaurantShell({ children }: { children: ReactNode }) {
  const params = useParams<{ etablissement: string }>();
  const slug = params.etablissement;

  return (
    <ModuleScope module="restaurant">
      <RestaurantProvider slug={slug}>
        <DeviceGate>
          <ShellLayout>{children}</ShellLayout>
        </DeviceGate>
      </RestaurantProvider>
    </ModuleScope>
  );
}

/**
 * Établissement réel : l'appareil doit être appairé, puis un utilisateur
 * identifié (mot de passe une fois, puis PIN). La démonstration n'a ni l'un
 * ni l'autre.
 */
function DeviceGate({ children }: { children: ReactNode }) {
  const { isDemo, status, activeUser } = useRestaurant();
  if (isDemo) return children;
  if (status === "unpaired") return <PairingScreen />;
  if (status === "ready" && !activeUser) return <UserGate />;
  return children;
}

function useOpenOrderCount(): number {
  const data = useDayData();
  if (!data) return 0;
  const statuses = new Map<string, ("pending" | "ready" | "served")[]>();
  for (const invoice of data.invoices) {
    if (invoice.paymentStatus === "cancelled") continue;
    statuses.set(invoice.orderId, [...(statuses.get(invoice.orderId) ?? []), invoice.prepStatus]);
  }
  return [...statuses.values()].filter((list) => orderPrepStatus(list) !== "served").length;
}

function ShellLayout({ children }: { children: ReactNode }) {
  const { status, slug, isModuleEnabled } = useRestaurant();
  const pathname = usePathname();
  const isRestaurantEnabled = isModuleEnabled("restaurant");
  const currentItem = navItemForPath(pathname, slug);
  const disabledModule = !isRestaurantEnabled
    ? "restaurant"
    : currentItem && !isModuleEnabled(navItemModule(currentItem))
      ? navItemModule(currentItem)
      : null;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isOrderEntry = pathname.endsWith("/commandes/nouvelle");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-action px-4 py-2 text-on-action focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col bg-surface lg:flex">
        <SidebarContent />
      </aside>

      <Sheet
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        side="left"
        title={<Brand />}
        className="lg:hidden"
      >
        <SidebarContent onNavigate={() => setIsDrawerOpen(false)} isInDrawer />
      </Sheet>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <Topbar onOpenMenu={() => setIsDrawerOpen(true)} />
        <DemoBanner />
        <main
          id="contenu"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-[1400px] flex-1 px-4 pt-4 outline-none sm:px-6 lg:px-8 lg:pt-6",
            isOrderEntry ? "pb-28 lg:pb-8" : "pb-28 lg:pb-10",
          )}
        >
          {status === "ready" && disabledModule ? (
            <ModuleDisabled module={disabledModule} />
          ) : status === "ready" ? (
            children
          ) : status === "error" ? (
            <EmptyState
              icon={FlaskConical}
              title="La base locale n'a pas pu être ouverte"
              description="Le navigateur bloque peut-être le stockage local (navigation privée). Autorisez-le, puis rechargez la page."
            />
          ) : (
            <LoadingState />
          )}
        </main>
        {isOrderEntry || !isRestaurantEnabled ? null : <BottomNav />}
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Gérant",
  waiter: "Serveur",
  prep: "Préparation",
  courier: "Livreur",
  reader: "Lecteur",
  owner: "Propriétaire",
};

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-on-primary"
      >
        O
      </span>
      <span className="text-base font-bold tracking-wide">OPTIMA</span>
    </span>
  );
}

function SidebarContent({
  onNavigate = () => {},
  isInDrawer = false,
}: {
  onNavigate?: () => void;
  isInDrawer?: boolean;
}) {
  const { slug, establishmentName, ctx, isDemo, activeUser, lock, isModuleEnabled } =
    useRestaurant();
  const pathname = usePathname();
  const openOrders = useOpenOrderCount();
  const [isConfirmingPassword, setIsConfirmingPassword] = useState(false);
  const items = enabledNavItems(NAV_ITEMS, isModuleEnabled);
  const needsPassword = !isDemo && activeUser?.role === "manager" && ctx.role !== "manager";

  return (
    <div className={cn("flex h-full flex-col", isInDrawer ? "-mx-2" : "px-5 py-6")}>
      {isInDrawer ? null : (
        <div className="mb-8 px-2">
          <Brand />
        </div>
      )}
      <p className="mb-2 px-3 text-xs font-medium text-text-muted">{establishmentName}</p>
      <nav aria-label="Navigation du restaurant" className="flex-1">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive = isNavItemActive(pathname, slug, item.segment);
            const Icon = item.icon;
            return (
              <li key={item.segment}>
                <Link
                  href={restaurantHref(slug, item.segment)}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-nav-active-bg text-nav-active-text shadow-sm"
                      : "text-text hover:bg-bg-subtle",
                  )}
                >
                  <Icon aria-hidden className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.segment === "commandes" && openOrders > 0 ? (
                    <CountBadge>
                      {openOrders}
                      <span className="sr-only"> commandes en cours</span>
                    </CountBadge>
                  ) : null}
                  {item.isUpcoming ? (
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isActive ? "text-nav-active-text" : "text-text-muted",
                      )}
                    >
                      Bientôt
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col items-center gap-3 rounded-card bg-bg-subtle px-4 py-5 text-center">
        <p className="text-sm font-medium">Fin du service ?</p>
        <Link
          href={restaurantHref(slug, "clotures")}
          onClick={onNavigate}
          className={buttonClasses("primary", "md", "w-full")}
        >
          <Calculator aria-hidden />
          Clôturer mon service
        </Link>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-border px-2 pt-5">
        <Avatar name={ctx.userName} presence="online" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{ctx.userName}</p>
          <p className="truncate text-xs text-text-muted">
            {ROLE_LABELS[ctx.role] ?? ctx.role} · appareil {ctx.deviceCode}
          </p>
        </div>
        {isDemo ? null : (
          <IconButton
            label="Changer d'utilisateur"
            variant="ghost"
            size="sm"
            onClick={() => {
              onNavigate();
              void lock();
            }}
          >
            <UserRoundCog />
          </IconButton>
        )}
      </div>
      {needsPassword ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setIsConfirmingPassword(true)}
        >
          <KeyRound aria-hidden />
          Actions de gérant : mot de passe
        </Button>
      ) : null}
      <Sheet
        open={isConfirmingPassword}
        onOpenChange={setIsConfirmingPassword}
        title="Confirmer votre mot de passe"
        description="Entré par code PIN, un gérant agit comme un serveur. Le mot de passe rouvre les actions de gérant pendant 15 minutes."
      >
        <LinkUserForm submitLabel="Confirmer" onLinked={() => setIsConfirmingPassword(false)} />
      </Sheet>
      {isInDrawer ? (
        <div className="mt-4 flex items-center justify-between gap-3 px-2 sm:hidden">
          <span className="text-xs text-text-muted">Thème</span>
          <ThemeSwitcher />
        </div>
      ) : null}
    </div>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { slug } = useRestaurant();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(
      `${restaurantHref(slug, "commandes")}${value ? `?q=${encodeURIComponent(value)}` : ""}`,
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75 lg:border-none">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-20 lg:px-8">
        <IconButton
          label="Ouvrir le menu"
          variant="ghost"
          onClick={onOpenMenu}
          className="-ml-2 lg:hidden"
        >
          <Menu />
        </IconButton>
        <span className="lg:hidden">
          <Brand />
        </span>

        <form role="search" onSubmit={onSearch} className="hidden min-w-0 flex-1 md:block">
          <label className="flex h-11 max-w-md items-center gap-3 border-b border-border-strong text-sm focus-within:border-focus-ring">
            <Search aria-hidden className="size-4 shrink-0 text-text-muted" />
            <span className="sr-only">Rechercher une commande</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une commande, une table, un serveur…"
              className="h-full min-w-0 flex-1 bg-transparent placeholder:text-text-subtle focus:outline-none"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden xl:inline-flex">
            <SyncStatus />
          </span>
          <span className="xl:hidden">
            <SyncStatus compact />
          </span>
          <span className="hidden sm:inline-flex">
            <ThemeSwitcher />
          </span>
        </div>
      </div>
    </header>
  );
}

function DemoBanner() {
  const { isDemo, resetDemo } = useRestaurant();
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isDemo) return null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-3 sm:px-6 lg:px-8 lg:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed border-border-strong bg-surface px-3 py-2 text-xs text-text-muted">
        <FlaskConical aria-hidden className="size-4 shrink-0 text-accent" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-text">Données de démonstration.</span>{" "}
          <span className="hidden sm:inline">
            Elles sont enregistrées uniquement dans ce navigateur ; prix et prénoms sont fictifs.
          </span>
          <span className="sm:hidden">Fictives, dans ce navigateur seulement.</span>
        </p>
        {isConfirming ? (
          <span className="flex items-center gap-2">
            <span className="text-text">Tout effacer et recommencer ?</span>
            <Button
              size="sm"
              variant="action"
              className="h-8"
              onClick={() => {
                setIsConfirming(false);
                void resetDemo();
              }}
            >
              Confirmer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setIsConfirming(false)}
            >
              Annuler
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsConfirming(true)}>
            <RotateCcw aria-hidden />
            Réinitialiser
          </Button>
        )}
      </div>
    </div>
  );
}

const BOTTOM_ITEMS = ["", "commandes", "commandes/nouvelle", "menus"] as const;

/** Barre d'onglets inférieure du serveur, en dessous de `lg` (§ 6). */
function BottomNav() {
  const { slug, isModuleEnabled } = useRestaurant();
  const pathname = usePathname();
  const openOrders = useOpenOrderCount();
  const items = enabledNavItems(
    BOTTOM_ITEMS.map((segment) => NAV_ITEMS.find((item) => item.segment === segment)).filter(
      (item) => item !== undefined,
    ),
    isModuleEnabled,
  );

  return (
    <nav
      aria-label="Navigation rapide"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, slug, item.segment);
          const isPrimary = item.segment === "commandes/nouvelle";
          const Icon = item.icon;
          return (
            <li key={item.segment}>
              <Link
                href={restaurantHref(slug, item.segment)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  isActive ? "text-text" : "text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-12 place-items-center rounded-full transition-colors duration-150",
                    isPrimary
                      ? "bg-primary text-on-primary"
                      : isActive
                        ? "bg-nav-active-bg text-nav-active-text"
                        : "",
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                {item.shortLabel}
                {item.segment === "commandes" && openOrders > 0 ? (
                  <CountBadge className="absolute top-1.5 left-1/2 ml-2">{openOrders}</CountBadge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Skeleton className="h-64 lg:col-span-2" />
      <Skeleton className="h-64" />
      <Skeleton className="h-48 lg:col-span-2" />
      <Skeleton className="h-48" />
    </div>
  );
}

const MODULE_NAMES: Record<string, string> = {
  restaurant: "Restaurant",
  delivery: "Livraison",
  preparation: "Postes de préparation",
  recipes: "Fiches recettes",
};

/**
 * EF-MOD-02, RG-MOD-01 : écran d'un module désactivé par le propriétaire. Les
 * données restent sur l'appareil ; les opérations en attente partiront à la
 * réactivation.
 */
function ModuleDisabled({ module }: { module: string }) {
  const { slug } = useRestaurant();
  const name = MODULE_NAMES[module] ?? module;
  return (
    <EmptyState
      icon={PackageX}
      title={
        module === "restaurant"
          ? "Le module Restaurant est désactivé"
          : `Le module « ${name} » est désactivé`
      }
      description={
        module === "restaurant"
          ? "Le propriétaire a désactivé le module Restaurant pour cet établissement. Les données de l'appareil sont conservées, et les opérations en attente partiront à sa réactivation."
          : "Le propriétaire n'a pas activé ce module pour cet établissement. Ses données, s'il y en a, sont conservées."
      }
      action={
        module === "restaurant" ? undefined : (
          <Link href={restaurantHref(slug, "")} className={buttonClasses("outline")}>
            Retour au tableau de bord
          </Link>
        )
      }
    />
  );
}
