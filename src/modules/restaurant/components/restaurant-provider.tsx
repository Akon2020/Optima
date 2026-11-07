"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Currency } from "@/shared/lib/money";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { getRestaurantDb, type DeviceUserRecord, type RestaurantDb } from "../offline/db";
import {
  DEMO_ESTABLISHMENT_NAME,
  DEMO_ESTABLISHMENT_SLUG,
  DEMO_MANAGER,
  ensureDemoData,
  resetDemoData,
} from "../offline/demo-data";
import {
  effectiveRole,
  getActiveUserId,
  getDevice,
  rememberDeviceUser,
  saveDevice,
  setActiveUser,
  wipeDevice,
  type DeviceInfo,
} from "../offline/device";
import type { DeviceContext } from "../offline/repository";
import {
  DeviceRevokedError,
  OfflineError,
  applyBootstrap,
  fetchBootstrap,
  syncOnce,
} from "../offline/sync";

export type SyncState = {
  state: "idle" | "syncing" | "offline" | "error";
  lastSyncAt: string | null;
  error: string | null;
};

type Status = "loading" | "unpaired" | "ready" | "error";

type RestaurantContextValue = {
  db: RestaurantDb;
  ctx: DeviceContext;
  slug: string;
  establishmentName: string;
  isDemo: boolean;
  status: Status;
  resetDemo: () => Promise<void>;
  /** Appareil appairé (mode réel), ou `null` en démonstration. */
  device: DeviceInfo | null;
  deviceUsers: DeviceUserRecord[];
  activeUser: DeviceUserRecord | null;
  /** Message à afficher à l'écran d'appairage (appareil révoqué, etc.). */
  notice: string | null;
  sync: SyncState;
  syncNow: () => void;
  completePairing: (pairing: {
    deviceId: string;
    code: string;
    token: string;
    establishmentId: string;
    user: { userId: string; name: string; role: string } | null;
  }) => Promise<void>;
  addDeviceUser: (user: { userId: string; name: string; role: string }) => Promise<void>;
  lock: () => Promise<void>;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function useRestaurant(): RestaurantContextValue {
  const value = useContext(RestaurantContext);
  if (!value) throw new Error("useRestaurant doit être utilisé sous <RestaurantProvider>.");
  return value;
}

const SYNC_INTERVAL_MS = 30_000;
const SYNC_AFTER_OPERATION_MS = 3_000;
const REVOKED_NOTICE =
  "Cet appareil a été révoqué : ses données locales ont été effacées. Un gérant doit l'appairer à nouveau.";

/**
 * Base locale et contexte de l'appareil.
 * - Démonstration (`/e/demo/...`) : données fictives, aucun serveur.
 * - Établissement réel : appareil appairé par un gérant, utilisateurs connectés
 *   par mot de passe puis par PIN, synchronisation automatique (EF-OFF-01).
 */
export function RestaurantProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const isDemo = slug === DEMO_ESTABLISHMENT_SLUG;
  const db = useMemo(() => getRestaurantDb(isDemo ? slug : `site-${slug}`), [isDemo, slug]);
  const [status, setStatus] = useState<Status>("loading");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ state: "idle", lastSyncAt: null, error: null });
  const [tick, setTick] = useState(() => Date.now());
  const isSyncing = useRef(false);

  const storedUsers = useLiveQuery(() => db.deviceUsers.toArray(), [db]);
  const deviceUsers = useMemo(() => storedUsers ?? [], [storedUsers]);
  const activeUserId = useLiveQuery(() => getActiveUserId(db), [db]) ?? null;
  const pending =
    useLiveQuery(
      () => (device ? db.outbox.where("status").equals("pending").count() : 0),
      [db, device],
    ) ?? 0;
  const activeUser = deviceUsers.find((user) => user.userId === activeUserId) ?? null;

  // Le rôle effectif dépend de l'ancienneté du mot de passe : réévalué chaque minute.
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const demoCtx = useMemo<DeviceContext>(
    () => ({
      establishmentId: slug,
      userId: DEMO_MANAGER.id,
      userName: DEMO_MANAGER.name,
      deviceId: "demo-device",
      deviceCode: "D01",
      role: "manager",
      settings: DEFAULT_RESTAURANT_SETTINGS,
    }),
    [slug],
  );

  const ctx = useMemo<DeviceContext>(() => {
    if (isDemo || !device) return demoCtx;
    return {
      establishmentId: device.establishmentId,
      userId: activeUser?.userId ?? "",
      userName: activeUser?.name ?? "",
      deviceId: device.deviceId,
      deviceCode: device.code,
      role: activeUser ? effectiveRole(activeUser, new Date(tick)) : "reader",
      settings: {
        ...DEFAULT_RESTAURANT_SETTINGS,
        currency: (device.currency || "CDF") as Currency,
        timeZone: device.timeZone || DEFAULT_RESTAURANT_SETTINGS.timeZone,
      },
    };
  }, [isDemo, device, activeUser, demoCtx, tick]);

  const handleRevoked = useCallback(async () => {
    await wipeDevice(db);
    setDevice(null);
    setNotice(REVOKED_NOTICE);
    setStatus("unpaired");
  }, [db]);

  /** Recharge l'état du serveur ; hors connexion, l'appareil continue sur ses données. */
  const refreshFromServer = useCallback(
    async (current: DeviceInfo): Promise<DeviceInfo> => {
      const snapshot = await fetchBootstrap(current);
      await applyBootstrap(db, snapshot);
      const updated: DeviceInfo = {
        ...current,
        establishmentId: snapshot.establishment.id,
        slug: snapshot.establishment.slug,
        name: snapshot.establishment.name,
        currency: snapshot.establishment.currency,
        timeZone: snapshot.establishment.timeZone,
      };
      await saveDevice(db, updated);
      return updated;
    },
    [db],
  );

  // Démarrage.
  useEffect(() => {
    let isActive = true;
    const start = async () => {
      if (isDemo) {
        await ensureDemoData(db, demoCtx);
        if (isActive) setStatus("ready");
        return;
      }
      const stored = await getDevice(db);
      if (!stored) {
        if (isActive) setStatus("unpaired");
        return;
      }
      let current = stored;
      try {
        current = await refreshFromServer(stored);
      } catch (error) {
        if (error instanceof DeviceRevokedError) {
          if (isActive) await handleRevoked();
          return;
        }
        // Hors connexion : on travaille sur les données locales (ENF-13).
      }
      if (isActive) {
        setDevice(current);
        setStatus("ready");
      }
    };
    start().catch((error: unknown) => {
      console.error(error);
      if (isActive) setStatus("error");
    });
    return () => {
      isActive = false;
    };
  }, [db, isDemo, demoCtx, refreshFromServer, handleRevoked]);

  const runSync = useCallback(async () => {
    if (!device || isSyncing.current) return;
    isSyncing.current = true;
    setSync((previous) => ({ ...previous, state: "syncing" }));
    try {
      await syncOnce(db, device);
      setSync({ state: "idle", lastSyncAt: new Date().toISOString(), error: null });
    } catch (error) {
      if (error instanceof DeviceRevokedError) {
        await handleRevoked();
      } else if (error instanceof OfflineError || !navigator.onLine) {
        setSync((previous) => ({ ...previous, state: "offline", error: null }));
      } else {
        setSync((previous) => ({
          ...previous,
          state: "error",
          error: error instanceof Error ? error.message : "Erreur de synchronisation.",
        }));
      }
    } finally {
      isSyncing.current = false;
    }
  }, [db, device, handleRevoked]);

  // EF-OFF-01 : toutes les 30 secondes, au retour du réseau, et peu après chaque opération.
  useEffect(() => {
    if (!device) return;
    const first = window.setTimeout(() => void runSync(), 0);
    const interval = window.setInterval(() => void runSync(), SYNC_INTERVAL_MS);
    const onOnline = () => void runSync();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [device, runSync]);

  useEffect(() => {
    if (!device || pending === 0) return;
    const id = window.setTimeout(() => void runSync(), SYNC_AFTER_OPERATION_MS);
    return () => window.clearTimeout(id);
  }, [device, pending, runSync]);

  const syncNow = useCallback(() => void runSync(), [runSync]);

  const resetDemo = useCallback(async () => {
    setStatus("loading");
    try {
      await resetDemoData(db, demoCtx);
      setStatus("ready");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }, [db, demoCtx]);

  const completePairing = useCallback<RestaurantContextValue["completePairing"]>(
    async (pairing) => {
      const provisional: DeviceInfo = {
        deviceId: pairing.deviceId,
        code: pairing.code,
        token: pairing.token,
        establishmentId: pairing.establishmentId,
        slug,
        name: slug,
        currency: "CDF",
        timeZone: DEFAULT_RESTAURANT_SETTINGS.timeZone,
      };
      await saveDevice(db, provisional);
      const current = await refreshFromServer(provisional);
      if (pairing.user) {
        await rememberDeviceUser(db, {
          ...pairing.user,
          role: pairing.user.role as DeviceUserRecord["role"],
        });
      }
      setNotice(null);
      setDevice(current);
      setStatus("ready");
    },
    [db, slug, refreshFromServer],
  );

  const addDeviceUser = useCallback<RestaurantContextValue["addDeviceUser"]>(
    async (user) => {
      await rememberDeviceUser(db, { ...user, role: user.role as DeviceUserRecord["role"] });
    },
    [db],
  );

  const lock = useCallback(async () => {
    await setActiveUser(db, null);
  }, [db]);

  const value = useMemo<RestaurantContextValue>(
    () => ({
      db,
      ctx,
      slug,
      establishmentName: isDemo ? DEMO_ESTABLISHMENT_NAME : (device?.name ?? slug),
      isDemo,
      status,
      resetDemo,
      device,
      deviceUsers,
      activeUser,
      notice,
      sync,
      syncNow,
      completePairing,
      addDeviceUser,
      lock,
    }),
    [
      db,
      ctx,
      slug,
      isDemo,
      status,
      resetDemo,
      device,
      deviceUsers,
      activeUser,
      notice,
      sync,
      syncNow,
      completePairing,
      addDeviceUser,
      lock,
    ],
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}
