"use client";

import { Smartphone, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, buttonClasses } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { pairDeviceAction } from "../../server/device-actions";

import { useRestaurant } from "../restaurant-provider";

/**
 * Appairage de l'appareil (EF-CPT-04, RG-OFF-02) : un gérant connecté sur ce
 * navigateur enregistre l'appareil. Il reçoit un code (D01, D02…) utilisé dans
 * la numérotation des factures, puis les données de l'établissement.
 */
export function PairingScreen() {
  const { slug, notice, completePairing } = useRestaurant();
  const [error, setError] = useState<{ message: string; needsLogin: boolean } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setIsPending(true);
    setError(null);
    try {
      const result = await pairDeviceAction({ slug, name });
      if (!result.ok) {
        setError({
          message: result.message,
          needsLogin: result.code === "UNAUTHENTICATED" || result.code === "MFA_REQUIRED",
        });
        return;
      }
      await completePairing(result.data);
    } catch {
      setError({
        message: "Serveur injoignable. L'appairage exige une connexion Internet.",
        needsLogin: false,
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-card sm:p-8">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-card bg-primary-subtle text-text"
        >
          <Smartphone className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Appairer cet appareil</h1>
        <p className="mt-2 text-sm text-text-muted">
          Avant le premier service, un gérant enregistre ce téléphone ou cette tablette. Il recevra
          un code (D01, D02…) qui rend ses factures uniques, même sans Internet.
        </p>
        {notice ? (
          <p
            role="alert"
            className="mt-4 flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        ) : null}
        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="mt-6 flex flex-col gap-4"
        >
          {error ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm"
            >
              <p>{error.message}</p>
              {error.needsLogin ? (
                <Link href="/connexion" className="font-medium text-link underline">
                  Se connecter en tant que gérant
                </Link>
              ) : null}
            </div>
          ) : null}
          <Field
            label="Nom de l'appareil"
            hint="Par exemple : Téléphone salle 1, Tablette comptoir."
          >
            {({ id, describedBy }) => (
              <Input id={id} name="name" required maxLength={60} aria-describedby={describedBy} />
            )}
          </Field>
          <Button type="submit" variant="action" size="lg" disabled={isPending} className="w-full">
            {isPending ? "Appairage…" : "Appairer cet appareil"}
          </Button>
        </form>
        <Link href="/" className={buttonClasses("ghost", "sm", "mt-4")}>
          Retour à l&apos;accueil
        </Link>
      </div>
      <ThemeSwitcher showLabels />
    </main>
  );
}
