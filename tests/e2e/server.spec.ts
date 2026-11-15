import { createHmac } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { readE2eState, type E2eAccount } from "./server/env";

/**
 * Parcours qui exigent le serveur et sa base (D-062), sur `optima_e2e`
 * préparée à chaque lancement : connexion (EF-AUT-01, EF-AUT-03),
 * appairage et code PIN (EF-CPT-04, EF-AUT-05), commande synchronisée et vue
 * par un second appareil, encaissement renvoyé au premier (EF-OFF-01 à 03),
 * vue d'ensemble du propriétaire (P6). Sans base locale, ils sont sautés.
 */
const state = readE2eState();
test.skip(!state.available, state.available ? "" : `Base de test indisponible : ${state.reason}`);
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

const ready = () => {
  if (!state.available) throw new Error("base de test indisponible");
  return state;
};
const restaurant = () => `/e/${ready().slug}/restaurant`;
const PIN = "2580";

/** Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) calculé comme une application. */
function totp(secretBase32: string, timeMs = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secretBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30_000)));
  const hmac = createHmac("sha1", bytes).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

async function login(page: Page, account: E2eAccount): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou numéro de téléphone").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function typePin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

/**
 * Un appareil neuf : le gérant se connecte et appaire l'appareil, puis
 * l'utilisateur indiqué y choisit son PIN (après son mot de passe s'il n'est
 * pas ce gérant).
 */
async function newDevice(browser: Browser, name: string, user: E2eAccount): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await page.goto(restaurant());
  await page.getByLabel("Nom de l'appareil").fill(name);
  await page.getByRole("button", { name: "Appairer cet appareil" }).click();

  // Le gérant qui vient d'appairer est déjà proposé ; un autre s'ajoute par mot de passe.
  await expect(page.getByRole("heading", { name: "Qui travaille ?" })).toBeVisible();
  if (user.email === ready().manager.email) {
    await page.getByRole("button", { name: new RegExp(`^${user.name}`) }).click();
  } else {
    await page.getByRole("button", { name: "Ajouter un utilisateur" }).click();
    await expect(page.getByRole("heading", { name: "Connexion sur cet appareil" })).toBeVisible();
    await page.getByLabel("E-mail ou numéro de téléphone").fill(user.email);
    await page.getByLabel("Mot de passe").fill(user.password);
    await page.getByRole("button", { name: "Se connecter sur cet appareil" }).click();
  }
  await expect(page.getByRole("heading", { name: "Choisissez votre code PIN" })).toBeVisible();
  await typePin(page, PIN);
  await expect(page.getByRole("heading", { name: "Confirmez votre code PIN" })).toBeVisible();
  await typePin(page, PIN);
  await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();
  return page;
}

async function waitForSync(page: Page): Promise<void> {
  await expect(
    page.getByRole("status").filter({ hasText: "tout est synchronisé" }).first(),
  ).toBeAttached({ timeout: 30_000 });
}

/** Résumé de la commande, tel que l'affiche la liste des commandes. */
let orderSummary = "";

test("EF-AUT-01 : un mot de passe faux est refusé, le bon ouvre la session", async ({ page }) => {
  await login(page, { ...ready().manager, password: "mauvais-mot-de-passe" });
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await expect(page.getByRole("heading", { name: ready().manager.name })).toBeVisible();
});

test("EF-OFF-01 à 03 : une commande d'un appareil arrive sur un autre, l'encaissement revient", async ({
  browser,
}) => {
  test.slow();
  // Appareil A : le serveur prend une commande à emporter.
  const deviceA = await newDevice(browser, "Téléphone salle E2E", ready().waiter);
  await deviceA.goto(`${restaurant()}/commandes/nouvelle`);
  await deviceA.getByRole("radio", { name: "À emporter" }).click();
  for (let count = 0; count < 2; count += 1) {
    await deviceA.getByRole("button", { name: "Ajouter Primus 72 cl", exact: true }).click();
  }
  await deviceA.getByRole("button", { name: /Voir la commande/ }).click();
  await deviceA
    .getByRole("dialog", { name: "Commande en cours" })
    .getByRole("button", { name: "Valider la commande" })
    .click();
  const done = deviceA.getByRole("dialog", { name: "Commande enregistrée" });
  await expect(done.getByText(/FAC-\d{4}-D\d{2}-\d{6}/)).toBeVisible();
  await done.getByRole("link", { name: "Commandes" }).click();
  await waitForSync(deviceA);
  orderSummary = "2× Primus 72 cl";

  // Appareil B : la gérante voit la commande et l'encaisse.
  const deviceB = await newDevice(browser, "Tablette comptoir E2E", ready().manager);
  await deviceB.goto(`${restaurant()}/commandes`);
  await deviceB.getByRole("button", { name: new RegExp(orderSummary) }).click();
  await deviceB.getByRole("button", { name: "Encaisser 7 000 FC" }).click();
  await deviceB
    .getByRole("dialog", { name: /^Encaisser/ })
    .getByRole("button", { name: "Encaisser 7 000 FC" })
    .click();
  await expect(
    deviceB.getByRole("dialog", { name: /À emporter · 7 000 FC/ }).getByText("Payée", {
      exact: true,
    }),
  ).toBeVisible();
  await waitForSync(deviceB);

  // Retour sur A : après synchronisation, la commande est payée.
  await deviceA
    .getByRole("button", { name: /^En ligne/ })
    .first()
    .click();
  await deviceA.getByRole("button", { name: "Synchroniser maintenant" }).click();
  await deviceA.keyboard.press("Escape");
  await deviceA.getByRole("button", { name: new RegExp(orderSummary) }).click();
  await expect(
    deviceA.getByRole("dialog", { name: /À emporter · 7 000 FC/ }).getByText("Payée", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });

  await deviceA.context().close();
  await deviceB.context().close();
});

test("EF-AUT-03, P6 : le propriétaire entre avec son code TOTP et voit l'établissement", async ({
  page,
}) => {
  const { owner, establishmentName } = ready();
  await login(page, owner);
  await expect(page).toHaveURL(/\/connexion\/double-authentification/);
  await page.getByLabel("Code de l'application d'authentification").fill(totp(owner.totpSecret));
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page).toHaveURL(/\/proprietaire/);
  await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.getByText(establishmentName).first()).toBeVisible();
  // La vente encaissée sur l'appareil remonte au propriétaire.
  await expect(page.getByText("7 000 FC").first()).toBeVisible();
});

test("EF-CPT-04 : le gérant voit les deux appareils appairés", async ({ page }) => {
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await page.goto(`/e/${ready().slug}/appareils`);
  await expect(page.getByText("Téléphone salle E2E")).toBeVisible();
  await expect(page.getByText("Tablette comptoir E2E")).toBeVisible();
});
