import "server-only";

import { cookies, headers } from "next/headers";

import { getPrisma } from "../db/client";
import { AUTH_POLICY } from "./policy";
import { validateSession, type ValidSession } from "./sessions";

/** Session de la requête en cours, ou `null`. */
export async function getCurrentSession(): Promise<ValidSession | null> {
  const store = await cookies();
  return validateSession(getPrisma(), store.get(AUTH_POLICY.sessionCookieName)?.value);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_POLICY.sessionCookieName)?.value;
}

/** Cookie de session : HttpOnly, Secure, SameSite=Lax, préfixe __Host- (CLAUDE.md § 5.2). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(AUTH_POLICY.sessionCookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(AUTH_POLICY.sessionCookieName);
}

/** Adresse IP et navigateur, pour la limitation des tentatives et l'audit. */
export async function requestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || list.get("x-real-ip") || "inconnue",
    userAgent: list.get("user-agent"),
  };
}
