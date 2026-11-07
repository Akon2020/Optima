"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearSessionCookie,
  getSessionToken,
  requestMeta,
  setSessionCookie,
} from "@/server/auth/current";
import {
  beginTotpSetup,
  changePassword,
  confirmTotpSetup,
  login,
  verifySecondFactor,
  type LoginNext,
} from "@/server/auth/login";
import { revokeSession } from "@/server/auth/sessions";
import { getPrisma } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { toActionError } from "@/server/errors";

/** État renvoyé aux formulaires (useActionState). */
export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const ROUTES: Record<LoginNext, string> = {
  "change-password": "/connexion/nouveau-mot-de-passe",
  "totp-setup": "/connexion/activer-2fa",
  totp: "/connexion/double-authentification",
  home: "/compte",
};

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Saisissez votre e-mail ou votre numéro de téléphone."),
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  let next: LoginNext;
  try {
    const result = await login(getPrisma(), parsed.data, await requestMeta());
    if (result.status === "locked") {
      return { error: "Trop de tentatives. Patientez 15 minutes avant de réessayer." };
    }
    if (result.status === "suspended") {
      return { error: "Ce compte est suspendu. Contactez votre gérant ou le propriétaire." };
    }
    if (result.status === "invalid") {
      return { error: "Identifiant ou mot de passe incorrect." };
    }
    await setSessionCookie(result.token, result.expiresAt);
    next = result.next;
  } catch (error) {
    return { error: toActionError(error).message };
  }
  // « home » ne concerne que les membres : le propriétaire passe toujours par la 2FA.
  redirect(ROUTES[next]);
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Saisissez le mot de passe actuel."),
    newPassword: z.string().min(1, "Choisissez un nouveau mot de passe."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Les deux mots de passe ne sont pas identiques.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const token = await getSessionToken();
  if (!token) redirect("/connexion");
  let next: LoginNext;
  try {
    next = await changePassword(getPrisma(), { token, ...parsed.data }, await requestMeta());
  } catch (error) {
    return { error: toActionError(error).message };
  }
  // « home » ne concerne que les membres : le propriétaire passe toujours par la 2FA.
  redirect(ROUTES[next]);
}

export async function beginTotpSetupAction(): Promise<
  { ok: true; secret: string; uri: string } | { ok: false; error: string }
> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
  try {
    const result = await beginTotpSetup(
      getPrisma(),
      { token, encryptionKey: getEnv().AUTH_ENCRYPTION_KEY },
      await requestMeta(),
    );
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: toActionError(error).message };
  }
}

export async function confirmTotpSetupAction(
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
  try {
    const result = await confirmTotpSetup(
      getPrisma(),
      { token, code, encryptionKey: getEnv().AUTH_ENCRYPTION_KEY },
      await requestMeta(),
    );
    await setSessionCookie(result.token, result.expiresAt);
    return { ok: true, recoveryCodes: result.recoveryCodes };
  } catch (error) {
    return { ok: false, error: toActionError(error).message };
  }
}

export async function verifySecondFactorAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  if (code.length < 6) return { fieldErrors: { code: "Saisissez le code à 6 chiffres." } };
  const token = await getSessionToken();
  if (!token) redirect("/connexion");
  try {
    const result = await verifySecondFactor(
      getPrisma(),
      { token, code, encryptionKey: getEnv().AUTH_ENCRYPTION_KEY },
      await requestMeta(),
    );
    await setSessionCookie(result.token, result.expiresAt);
  } catch (error) {
    return { error: toActionError(error).message };
  }
  redirect("/proprietaire");
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await revokeSession(getPrisma(), token);
  await clearSessionCookie();
  redirect("/connexion");
}
