"use client";

import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";

import { linkDeviceUserAction } from "../../server/device-actions";

import type { DeviceUserRecord } from "../../offline/db";
import { useRestaurant } from "../restaurant-provider";

/**
 * Connexion d'un membre sur cet appareil par mot de passe (en ligne,
 * RG-OFF-02). Sert aussi au gérant pour reconfirmer son mot de passe avant
 * des actions de gérant (le PIN ne suffit pas, CLAUDE.md § 5.1).
 */
export function LinkUserForm({
  onLinked,
  submitLabel = "Se connecter sur cet appareil",
}: {
  onLinked: (user: DeviceUserRecord | { userId: string }) => void;
  submitLabel?: string;
}) {
  const { device, addDeviceUser, db } = useRestaurant();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device) return;
    const form = new FormData(event.currentTarget);
    setIsPending(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        setError("Une connexion Internet est nécessaire pour vérifier le mot de passe.");
        return;
      }
      const result = await linkDeviceUserAction({
        deviceToken: device.token,
        identifier: String(form.get("identifier") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await addDeviceUser(result.data);
      onLinked((await db.deviceUsers.get(result.data.userId)) ?? { userId: result.data.userId });
    } catch {
      setError("Serveur injoignable. Vérifiez la connexion et réessayez.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex w-full flex-col gap-4"
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <Field label="E-mail ou numéro de téléphone">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="identifier"
            autoComplete="username"
            required
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Field label="Mot de passe">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Button type="submit" variant="action" size="lg" disabled={isPending} className="w-full">
        <LogIn aria-hidden />
        {isPending ? "Vérification…" : submitLabel}
      </Button>
    </form>
  );
}
