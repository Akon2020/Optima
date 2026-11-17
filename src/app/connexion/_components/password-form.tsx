"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";

import { changePasswordAction, type FormState } from "../actions";
import { FormError } from "./auth-card";

export function PasswordForm() {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <Field label="Mot de passe actuel (provisoire)" error={state?.fieldErrors?.currentPassword}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        label="Nouveau mot de passe"
        hint="Au moins 10 caractères. Une phrase courte est plus facile à retenir."
        error={state?.fieldErrors?.newPassword}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field label="Confirmez le nouveau mot de passe" error={state?.fieldErrors?.confirmPassword}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Button type="submit" variant="action" size="lg" disabled={isPending} className="mt-2 w-full">
        <KeyRound aria-hidden />
        {isPending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
