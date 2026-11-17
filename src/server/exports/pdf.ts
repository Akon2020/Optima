import "server-only";

import { chromium, type Browser, type LaunchOptions } from "playwright-core";

import { DomainError } from "@/shared/lib/errors";
import { PRINT_TOKENS } from "@/styles/tokens/print";

import { logger } from "../logger";
import { escapeHtml } from "./table-document";

/**
 * Rendu PDF A4 par Chromium (pile D-014 : Playwright), avec `playwright-core`
 * qui pilote un navigateur déjà installé, sans en télécharger un :
 * - `PDF_BROWSER_PATH` : chemin de l'exécutable (Chromium de l'image Docker) ;
 * - sinon `PDF_BROWSER_CHANNEL` : « chrome » (par défaut) ou « msedge ».
 *
 * Un seul navigateur par processus, lancé à la première demande et fermé
 * après deux minutes sans export : le lancer et le fermer à chaque PDF
 * coûterait plusieurs secondes. Chaque document a son propre contexte isolé.
 *
 * Sécurité : le document est rendu sans JavaScript, hors ligne, et toute
 * requête est bloquée : ni script ni ressource externe ne peuvent s'exécuter
 * ou être appelés depuis le contenu exporté.
 */

const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 20_000;
const IDLE_CLOSE_MS = 120_000;

let running = 0;
let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function launchOptions(): LaunchOptions {
  const path = process.env.PDF_BROWSER_PATH?.trim();
  if (path) return { executablePath: path, headless: true };
  const channel = process.env.PDF_BROWSER_CHANNEL?.trim() || "chrome";
  return { channel, headless: true };
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const launching = chromium.launch(launchOptions()).then((browser) => {
      browser.on("disconnected", () => {
        if (browserPromise === launching) browserPromise = null;
      });
      return browser;
    });
    launching.catch(() => {
      if (browserPromise === launching) browserPromise = null;
    });
    browserPromise = launching;
  }
  return browserPromise;
}

/** Ferme le navigateur partagé (tests, arrêt du serveur). */
export async function closePdfBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending?.catch(() => null);
  if (!browser) return;
  // La fermeture de Chrome peut prendre plus de dix secondes (constaté sous
  // Windows) : on ne l'attend pas au-delà de 5 secondes. Playwright arrête de
  // toute façon le navigateur à la fin du processus.
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000).unref?.()),
  ]);
}

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (running === 0) void closePdfBrowser();
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

export async function renderPdf(
  html: string,
  options: { landscape?: boolean; footerLabel?: string } = {},
): Promise<Buffer> {
  if (running >= MAX_CONCURRENT_RENDERS) {
    throw new DomainError(
      "EXPORT_BUSY",
      "Des exports PDF sont déjà en cours : réessayez dans un instant.",
    );
  }
  running += 1;
  try {
    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch (error) {
      logger.error({ err: error }, "Navigateur PDF introuvable");
      throw new DomainError(
        "PDF_UNAVAILABLE",
        "L'export PDF n'est pas disponible sur ce serveur. Utilisez l'export Excel ou CSV, et prévenez l'administrateur.",
      );
    }
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: "load" });
      const label = escapeHtml(options.footerLabel ?? "OPTIMA");
      const pdf = await page.pdf({
        format: "A4",
        landscape: options.landscape ?? false,
        printBackground: true,
        margin: { top: "12mm", right: "10mm", bottom: "14mm", left: "10mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;font-size:7pt;color:${PRINT_TOKENS.muted};padding:0 10mm;display:flex;justify-content:space-between;"><span>${label}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      });
      return Buffer.from(pdf);
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    running -= 1;
    scheduleIdleClose();
  }
}
