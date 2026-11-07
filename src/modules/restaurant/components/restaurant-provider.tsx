"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { getRestaurantDb, type RestaurantDb } from "../offline/db";
import {
  DEMO_ESTABLISHMENT_NAME,
  DEMO_ESTABLISHMENT_SLUG,
  DEMO_MANAGER,
  ensureDemoData,
  resetDemoData,
} from "../offline/demo-data";
import type { DeviceContext } from "../offline/repository";

type RestaurantContextValue = {
  db: RestaurantDb;
  ctx: DeviceContext;
  slug: string;
  establishmentName: string;
  isDemo: boolean;
  status: "loading" | "ready" | "error";
  resetDemo: () => Promise<void>;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function useRestaurant(): RestaurantContextValue {
  const value = useContext(RestaurantContext);
  if (!value) throw new Error("useRestaurant doit être utilisé sous <RestaurantProvider>.");
  return value;
}

/**
 * Ouvre la base locale de l'établissement et fournit le contexte de
 * l'appareil. Tant que l'authentification (D-015) et l'enregistrement des
 * appareils n'existent pas, seul l'établissement de démonstration est servi,
 * avec un utilisateur et un appareil fictifs, sans aucune donnée serveur.
 */
export function RestaurantProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const db = useMemo(() => getRestaurantDb(slug), [slug]);
  const ctx = useMemo<DeviceContext>(
    () => ({
      establishmentId: slug,
      userId: DEMO_MANAGER.id,
      userName: DEMO_MANAGER.name,
      deviceId: "demo-device",
      deviceCode: "D01",
      settings: DEFAULT_RESTAURANT_SETTINGS,
    }),
    [slug],
  );
  const [status, setStatus] = useState<RestaurantContextValue["status"]>("loading");

  useEffect(() => {
    let isActive = true;
    ensureDemoData(db, ctx)
      .then(() => isActive && setStatus("ready"))
      .catch((error: unknown) => {
        console.error(error);
        if (isActive) setStatus("error");
      });
    return () => {
      isActive = false;
    };
  }, [db, ctx]);

  const resetDemo = useCallback(async () => {
    setStatus("loading");
    await resetDemoData(db, ctx);
    setStatus("ready");
  }, [db, ctx]);

  const value = useMemo<RestaurantContextValue>(
    () => ({
      db,
      ctx,
      slug,
      establishmentName: DEMO_ESTABLISHMENT_NAME,
      isDemo: slug === DEMO_ESTABLISHMENT_SLUG,
      status,
      resetDemo,
    }),
    [db, ctx, slug, status, resetDemo],
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}
