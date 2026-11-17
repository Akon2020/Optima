"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";

import { loginAction, type FormState } from "../actions";
import { FormError } from "./auth-card";

export function LoginForm() {
  const [state, action, isPending] = useActionState<FormState, FormData>(loginAction, undefined);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <Field label="E-mail ou numéro de téléphone" error={state?.fieldErrors?.identifier}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="identifier"
            autoComplete="username"
            inputMode="email"
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field label="Mot de passe" error={state?.fieldErrors?.password}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Button type="submit" variant="action" size="lg" disabled={isPending} className="mt-2 w-full">
        <LogIn aria-hidden />
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-xs text-text-muted">
        Mot de passe oublié ? Demandez une réinitialisation à votre gérant, ou au propriétaire pour
        un compte de gérant (EF-AUT-04).
      </p>
    </form>
  );
}
