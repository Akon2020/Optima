import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateNonce, staticSecurityHeaders } from "./headers";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? null;

describe("politique de contenu (CLAUDE.md § 5.4)", () => {
  const production = buildContentSecurityPolicy({
    nonce: "abc123",
    isDevelopment: false,
    upgradeInsecureRequests: true,
  });

  it("n'autorise que les scripts portant le nonce, jamais en ligne ni eval en production", () => {
    expect(directive(production, "script-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
    expect(production).not.toContain("'unsafe-eval'");
    expect(directive(production, "style-src")).toEqual(["'self'", "'nonce-abc123'"]);
  });

  it("interdit les cadres, les objets et les formulaires vers l'extérieur", () => {
    expect(directive(production, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(production, "object-src")).toEqual(["'none'"]);
    expect(directive(production, "base-uri")).toEqual(["'self'"]);
    expect(directive(production, "form-action")).toEqual(["'self'"]);
    expect(directive(production, "connect-src")).toEqual(["'self'"]);
    expect(directive(production, "worker-src")).toEqual(["'self'"]);
    expect(directive(production, "upgrade-insecure-requests")).toEqual([]);
  });

  it("assouplit seulement ce qu'exigent les outils de développement", () => {
    const development = buildContentSecurityPolicy({
      nonce: "dev",
      isDevelopment: true,
      upgradeInsecureRequests: false,
    });
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
    expect(directive(development, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(development, "upgrade-insecure-requests")).toBeNull();
  });

  it("produit un nonce différent à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50);
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("pose HSTS seulement en HTTPS", () => {
    const keys = (isHttps: boolean) =>
      staticSecurityHeaders({ isHttps }).map((header) => header.key);
    expect(keys(true)).toContain("Strict-Transport-Security");
    expect(keys(false)).not.toContain("Strict-Transport-Security");
    expect(keys(false)).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });
});
