"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";

import { verifySecondFactorAction, type FormState } from "../actions";
import { FormError } from "./auth-card";

export function TotpVerifyForm() {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    verifySecondFactorAction,
    undefined,
  );

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <Field
        label="Code de l'application d'authentification"
        hint="6 chiffres. Sans téléphone, saisissez un code de secours."
        error={state?.fieldErrors?.code}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="text-center text-lg tracking-[0.3em] tabular"
          />
        )}
      </Field>
      <Button type="submit" variant="action" size="lg" disabled={isPending} className="w-full">
        <ShieldCheck aria-hidden />
        {isPending ? "Vérification…" : "Valider"}
      </Button>
    </form>
  );
}
