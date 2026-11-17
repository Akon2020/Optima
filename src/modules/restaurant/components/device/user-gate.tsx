"use client";

import { ArrowLeft, Lock, UserPlus } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "@/shared/lib/errors";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { checkPinPolicy } from "@/offline/pin";

import type { DeviceUserRecord } from "../../offline/db";
import { PASSWORD_FRESH_MS, setActiveUser, setUserPin, unlockWithPin } from "../../offline/device";
import { useRestaurant } from "../restaurant-provider";
import { LinkUserForm } from "./link-user-form";
import { PinPad } from "./pin-pad";

const ROLE_LABELS: Record<string, string> = {
  manager: "Gérant",
  waiter: "Serveur",
  prep: "Préparation",
  courier: "Livreur",
  reader: "Lecteur",
};

type View =
  | { kind: "list" }
  | { kind: "pin"; user: DeviceUserRecord }
  | { kind: "link"; reason?: string }
  | { kind: "set-pin"; userId: string; first: string | null };

function isPasswordFresh(user: DeviceUserRecord): boolean {
  return Date.now() - new Date(user.passwordVerifiedAt).getTime() < PASSWORD_FRESH_MS;
}

/**
 * Qui travaille sur cet appareil ? Changement d'utilisateur en deux gestes :
 * toucher son nom, taper son PIN (EF-AUT-05). Un nouvel utilisateur se
 * connecte d'abord avec son mot de passe (en ligne), puis choisit son PIN.
 */
export function UserGate() {
  const { db, deviceUsers, establishmentName, device } = useRestaurant();
  const [view, setView] = useState<View>(() =>
    deviceUsers.length === 0 ? { kind: "link" } : { kind: "list" },
  );
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function choose(user: DeviceUserRecord) {
    setPin("");
    setMessage(null);
    if (user.lockedAt) {
      setView({
        kind: "link",
        reason: `Code PIN bloqué pour ${user.name} : saisissez votre mot de passe.`,
      });
    } else if (!user.pinVerifier) {
      setView(
        isPasswordFresh(user)
          ? { kind: "set-pin", userId: user.userId, first: null }
          : {
              kind: "link",
              reason: `${user.name} doit d'abord se connecter avec son mot de passe.`,
            },
      );
    } else {
      setView({ kind: "pin", user });
    }
  }

  async function submitPin(value: string, user: DeviceUserRecord) {
    setIsBusy(true);
    const result = await unlockWithPin(db, user.userId, value);
    setIsBusy(false);
    if (result.ok) return;
    setPin("");
    if (result.isLocked) {
      setView({
        kind: "link",
        reason: "Trop d'erreurs : le code est bloqué. Saisissez votre mot de passe.",
      });
    } else {
      setMessage(
        `Code incorrect. ${result.remaining} essai${result.remaining > 1 ? "s" : ""} restant${result.remaining > 1 ? "s" : ""}.`,
      );
    }
  }

  async function submitNewPin(value: string, userId: string, first: string | null) {
    if (first === null) {
      const policy = checkPinPolicy(value);
      if (policy) {
        setMessage(policy);
        setPin("");
        return;
      }
      setMessage(null);
      setPin("");
      setView({ kind: "set-pin", userId, first: value });
      return;
    }
    if (value !== first) {
      setMessage("Les deux codes ne sont pas identiques. Recommencez.");
      setPin("");
      setView({ kind: "set-pin", userId, first: null });
      return;
    }
    setIsBusy(true);
    try {
      await setUserPin(db, userId, value);
      await setActiveUser(db, userId);
    } catch (error) {
      setMessage(errorMessage(error));
      setPin("");
      setView({ kind: "set-pin", userId, first: null });
    } finally {
      setIsBusy(false);
    }
  }

  const back =
    deviceUsers.length > 0 && view.kind !== "list" ? (
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => {
          setPin("");
          setMessage(null);
          setView({ kind: "list" });
        }}
      >
        <ArrowLeft aria-hidden />
        Utilisateurs
      </Button>
    ) : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-card bg-surface p-6 shadow-card sm:p-8">
        <div className="text-center">
          <p className="text-sm text-text-muted">
            {establishmentName}
            {device ? ` · appareil ${device.code}` : ""}
          </p>
          <h1 className="mt-1 text-xl font-semibold">
            {view.kind === "list"
              ? "Qui travaille ?"
              : view.kind === "pin"
                ? view.user.name
                : view.kind === "link"
                  ? "Connexion sur cet appareil"
                  : view.first === null
                    ? "Choisissez votre code PIN"
                    : "Confirmez votre code PIN"}
          </h1>
        </div>
        {back}

        {view.kind === "list" ? (
          <ul className="grid w-full grid-cols-2 gap-3">
            {deviceUsers.map((user) => (
              <li key={user.userId}>
                <button
                  type="button"
                  onClick={() => choose(user)}
                  className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border border-border bg-bg-subtle p-3 text-center transition-colors hover:border-action"
                >
                  <Avatar name={user.name} />
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    {user.lockedAt ? <Lock aria-hidden className="size-3" /> : null}
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setView({ kind: "link" });
                }}
                className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-strong p-3 text-sm font-medium text-text-muted transition-colors hover:border-action hover:text-text"
              >
                <UserPlus aria-hidden className="size-6" />
                Ajouter un utilisateur
              </button>
            </li>
          </ul>
        ) : null}

        {view.kind === "pin" ? (
          <>
            <PinPad
              label="Code PIN"
              value={pin}
              onChange={setPin}
              onComplete={(value) => void submitPin(value, view.user)}
              disabled={isBusy}
              hasError={message !== null && pin.length === 0}
            />
            {message ? (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            ) : null}
          </>
        ) : null}

        {view.kind === "link" ? (
          <>
            {view.reason ? (
              <p className="text-center text-sm text-text-muted">{view.reason}</p>
            ) : null}
            <LinkUserForm
              onLinked={(user) => {
                const record = "pinVerifier" in user ? user : null;
                if (record?.pinVerifier) {
                  void setActiveUser(db, record.userId);
                } else {
                  setPin("");
                  setView({ kind: "set-pin", userId: user.userId, first: null });
                }
              }}
            />
          </>
        ) : null}

        {view.kind === "set-pin" ? (
          <>
            <p className="text-center text-sm text-text-muted">
              Ce code à 4 chiffres vous permettra de reprendre la main sur cet appareil, même sans
              Internet. Ne le partagez pas.
            </p>
            <PinPad
              label={view.first === null ? "Nouveau code PIN" : "Confirmation du code PIN"}
              value={pin}
              onChange={setPin}
              onComplete={(value) => void submitNewPin(value, view.userId, view.first)}
              disabled={isBusy}
            />
            {message ? (
              <p role="alert" className="text-center text-sm text-danger">
                {message}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
