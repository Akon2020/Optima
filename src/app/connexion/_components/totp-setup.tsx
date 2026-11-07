"use client";

import { Copy, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonClasses } from "@/shared/ui/button";
import { Input } from "@/shared/ui/field";

import { beginTotpSetupAction, confirmTotpSetupAction } from "../actions";
import { FormError } from "./auth-card";

function groups(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Activation de la double authentification (EF-AUT-03) : clé à saisir dans
 * l'application, confirmation par un code, puis codes de secours affichés
 * une seule fois.
 */
export function TotpSetup() {
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          Double authentification activée. Notez ces <strong>codes de secours</strong> et gardez-les
          hors du téléphone : chacun permet une connexion si le téléphone est perdu. Ils ne seront
          plus jamais affichés.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-md bg-bg-subtle p-3 font-mono text-sm tabular">
          {recoveryCodes.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
        <Link href="/proprietaire" className={buttonClasses("action", "lg", "w-full")}>
          J&apos;ai noté les codes, continuer
        </Link>
      </div>
    );
  }

  if (!secret) {
    return (
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <p className="flex gap-3 text-sm text-text-muted">
          <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0" />
          Installez une application d&apos;authentification (Google Authenticator, Aegis, 2FAS…) sur
          votre téléphone, puis générez votre clé.
        </p>
        <Button
          variant="action"
          size="lg"
          disabled={isPending}
          className="w-full"
          onClick={() =>
            startTransition(async () => {
              const result = await beginTotpSetupAction();
              if (result.ok) setSecret({ secret: result.secret, uri: result.uri });
              else setError(result.error);
            })
          }
        >
          {isPending ? "Génération…" : "Générer ma clé"}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await confirmTotpSetupAction(code);
          if (result.ok) setRecoveryCodes(result.recoveryCodes);
          else setError(result.error);
        });
      }}
    >
      <FormError message={error} />
      <div>
        <p className="text-sm">Dans l&apos;application, ajoutez un compte avec cette clé :</p>
        <div className="mt-2 flex items-center gap-2 rounded-md bg-bg-subtle p-3">
          <code className="flex-1 font-mono text-sm break-all tabular">
            {groups(secret.secret)}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(secret.secret)}
            aria-label="Copier la clé"
          >
            <Copy aria-hidden />
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Sur le téléphone, vous pouvez aussi ouvrir ce lien :{" "}
          <a href={secret.uri} className="text-link underline">
            ajouter à l&apos;application
          </a>
          .
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        Code affiché par l&apos;application
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="text-center text-lg tracking-[0.3em] tabular"
        />
      </label>
      <Button
        type="submit"
        variant="action"
        size="lg"
        disabled={isPending || code.length !== 6}
        className="w-full"
      >
        <ShieldCheck aria-hidden />
        {isPending ? "Vérification…" : "Activer la double authentification"}
      </Button>
    </form>
  );
}
