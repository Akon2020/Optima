import { createHmac } from "node:crypto";

import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";

import { readE2eState, type E2eAccount } from "./server/env";

// Ces parcours attendent le serveur (connexion, synchronisation) : 30 s par
// vérification, pour rester fiables quand d'autres tests chargent la machine.
const expect = baseExpect.configure({ timeout: 30_000 });

/**
 * Parcours qui exigent le serveur et sa base (D-062), sur `optima_e2e`
 * préparée à chaque lancement : connexion (EF-AUT-01, EF-AUT-03),
 * appairage et code PIN (EF-CPT-04, EF-AUT-05), commande synchronisée et vue
 * par un second appareil, encaissement renvoyé au premier (EF-OFF-01 à 03),
 * vue d'ensemble du propriétaire (P6). Sans base locale, ils sont sautés.
 */
const state = readE2eState();
test.skip(!state.available, state.available ? "" : `Base de test indisponible : ${state.reason}`);
// Une journée qui se suit : rejouer une étape sur une base déjà avancée n'a pas de
// sens, donc aucune nouvelle tentative ; du temps en plus pour une machine chargée.
test.describe.configure({ mode: "serial", retries: 0, timeout: 180_000 });
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

/** Les deux appareils de la journée, partagés par les tests en série. */
let deviceA: Page;
let deviceB: Page;
const ORDER = "2× Primus 72 cl";

test.afterAll(async () => {
  await deviceA?.context().close();
  await deviceB?.context().close();
});

/** Ouvre le panneau de synchronisation et force l'envoi puis la réception. */
async function syncNow(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^(En ligne|Hors ligne)/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Synchroniser maintenant" }).click();
  await waitForSync(page);
  await page.keyboard.press("Escape");
}

test("EF-AUT-01 : un mot de passe faux est refusé, le bon ouvre la session", async ({ page }) => {
  await login(page, { ...ready().manager, password: "mauvais-mot-de-passe" });
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await expect(page.getByRole("heading", { name: ready().manager.name })).toBeVisible();
});

test("EF-CPT-04, EF-AUT-05 : deux appareils appairés, chacun avec son utilisateur et son PIN", async ({
  browser,
}) => {
  deviceA = await newDevice(browser, "Téléphone salle E2E", ready().waiter);
  deviceB = await newDevice(browser, "Tablette comptoir E2E", ready().manager);
});

test("P1, EF-REQ-02, EF-REQ-04 : réquisition du matin, stock du matin, reçu par l'autre appareil", async () => {
  // D-069 : la gérante fait sortir 24 Primus du magasin avant le stock du matin.
  await deviceB.goto(`${restaurant()}/requisitions`);
  await deviceB
    .getByRole("tablist", { name: "Points de service" })
    .getByRole("tab", { name: /Comptoir/ })
    .click();
  await deviceB.getByRole("button", { name: "Nouvelle réquisition" }).click();
  const sheet = deviceB.getByRole("dialog");
  await expect(sheet.getByText("Réquisition du matin")).toBeVisible();
  await sheet.getByLabel("Primus 72 cl", { exact: true }).fill("24");
  await sheet.getByRole("button", { name: "Valider la réquisition" }).click();
  await expect(deviceB.getByRole("status").filter({ hasText: /^REQ-/ })).toBeVisible();
  await expect(deviceB.getByText("+24 bouteilles · Primus 72 cl")).toBeVisible();

  await deviceB.goto(`${restaurant()}/stock-du-matin`);
  // EF-REQ-04 : la proposition reprend la réquisition du matin.
  await deviceB.getByRole("tab", { name: /Comptoir/ }).click();
  await expect(deviceB.getByLabel("Primus 72 cl", { exact: true })).toHaveValue("24");
  const morning: [string, string, number][] = [
    ["Comptoir", "Primus 72 cl", 24],
    ["Comptoir", "Eau minérale 50 cl", 12],
    ["Cuisine", "Tilapia", 10],
    ["Cuisine", "Frites", 20],
  ];
  for (const point of ["Comptoir", "Cuisine"]) {
    await deviceB.getByRole("tab", { name: new RegExp(point) }).click();
    for (const [, item, quantity] of morning.filter(([name]) => name === point)) {
      await deviceB.getByLabel(item, { exact: true }).fill(String(quantity));
    }
    await deviceB.getByRole("button", { name: `Valider le stock · ${point}` }).click();
    await expect(deviceB.getByRole("button", { name: `Valider le stock · ${point}` })).toBeHidden();
  }
  await waitForSync(deviceB);

  // Le téléphone de salle reçoit le stock : 24 Primus disponibles.
  await syncNow(deviceA);
  await deviceA.goto(`${restaurant()}/menus`);
  const primus = deviceA.locator("article", { hasText: "Primus 72 cl" });
  await expect(primus.getByText("24 en stock")).toBeVisible();
});

test("EF-OFF-01 à 03 : une commande d'un appareil arrive sur l'autre, l'encaissement revient", async () => {
  // Appareil A : le serveur prend une commande à emporter.
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

  // Appareil B : la gérante reçoit la commande et l'encaisse.
  await deviceB.goto(`${restaurant()}/commandes`);
  await syncNow(deviceB);
  await deviceB.getByRole("button", { name: new RegExp(ORDER) }).click();
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
  await deviceB.keyboard.press("Escape");
  await waitForSync(deviceB);

  // Retour sur A : après synchronisation, la commande est payée.
  await syncNow(deviceA);
  await deviceA.getByRole("button", { name: new RegExp(ORDER) }).click();
  await expect(
    deviceA.getByRole("dialog", { name: /À emporter · 7 000 FC/ }).getByText("Payée", {
      exact: true,
    }),
  ).toBeVisible();
  await deviceA.keyboard.press("Escape");
});

test("EF-PRE-01 à 03 : le poste marque la commande prête, le serveur est averti ; « épuisé » retire l'élément", async () => {
  // La tablette de la gérante sert d'écran au comptoir.
  await deviceB.goto(`${restaurant()}/preparation/comptoir`);
  await expect(deviceB.getByRole("heading", { name: "Comptoir", level: 1 })).toBeVisible();
  const ticket = deviceB.getByRole("article", { name: /À emporter/ });
  await expect(ticket.getByText("Primus 72 cl")).toBeVisible();
  // RG-PRE-01 : aucun montant sur l'écran du poste.
  await expect(ticket.getByText(/FC/)).toHaveCount(0);
  await ticket.getByRole("button", { name: "Prête" }).click();
  await expect(
    deviceB.getByRole("region", { name: "Prêtes, à servir" }).getByText(/À emporter/),
  ).toBeVisible();
  await waitForSync(deviceB);

  // EF-PRE-02 : le téléphone du serveur affiche la commande prête.
  await syncNow(deviceA);
  await expect(deviceA.getByText("1 commande prête à servir")).toBeVisible();

  // EF-PRE-03 : l'eau, déclarée épuisée, disparaît de la prise de commande.
  const soldOut = deviceB.getByRole("region", { name: "Éléments épuisés" });
  await soldOut
    .getByRole("listitem")
    .filter({ hasText: "Eau minérale 50 cl" })
    .getByRole("button", { name: "Déclarer épuisé" })
    .click();
  await waitForSync(deviceB);
  await syncNow(deviceA);
  await deviceA.goto(`${restaurant()}/commandes/nouvelle`);
  await expect(
    deviceA.getByRole("button", { name: "Ajouter Primus 72 cl", exact: true }),
  ).toBeVisible();
  await expect(
    deviceA.getByRole("button", { name: "Ajouter Eau minérale 50 cl", exact: true }),
  ).toHaveCount(0);

  // Remise en vente, pour la suite de la journée.
  await soldOut
    .getByRole("listitem")
    .filter({ hasText: "Eau minérale 50 cl" })
    .getByRole("button", { name: "Remettre en vente" })
    .click();
  await waitForSync(deviceB);
});

test("P5, EF-CLO-01 à 04 : caisse déclarée, stock compté, journée validée par la gérante", async () => {
  await deviceB.goto(`${restaurant()}/clotures`);

  // Sa caisse : 7 000 FC attendus en espèces, 7 000 FC comptés.
  await deviceB.getByRole("tab", { name: /Ma caisse/ }).click();
  await deviceB.getByLabel("Compté (FC)").fill("7000");
  await deviceB.getByRole("button", { name: "Déclarer ma caisse" }).click();
  await expect(deviceB.getByText("Mes déclarations")).toBeVisible();

  // Le stock de chaque poste : matin − ventes = compté, sans écart.
  await deviceB.getByRole("tab", { name: /^Stock/ }).click();
  const counted: [string, string, number][] = [
    ["Comptoir", "Primus 72 cl", 22],
    ["Comptoir", "Eau minérale 50 cl", 12],
    ["Cuisine", "Tilapia", 10],
    ["Cuisine", "Frites", 20],
  ];
  const points = deviceB.getByRole("tablist", { name: "Points de service" });
  for (const point of ["Comptoir", "Cuisine"]) {
    await points.getByRole("tab", { name: new RegExp(point) }).click();
    for (const [, item, quantity] of counted.filter(([name]) => name === point)) {
      await deviceB.getByLabel(`Stock compté, ${item}`).fill(String(quantity));
    }
    await deviceB.getByRole("button", { name: "Enregistrer le comptage" }).click();
    await expect(deviceB.getByRole("button", { name: "Enregistrer le comptage" })).toBeHidden();
  }
  await waitForSync(deviceB);

  // La journée : plus rien ne manque, la gérante valide.
  await deviceB.getByRole("tab", { name: /Journée/ }).click();
  const validate = deviceB.getByRole("button", { name: "Valider la journée" });
  await expect(validate).toBeEnabled({ timeout: 30_000 });
  await validate.click();
  await expect(deviceB.getByText("Journées validées")).toBeVisible({ timeout: 30_000 });
  await waitForSync(deviceB);
});

test("EF-ENC-03, D-059 : la gérante vend à crédit à une nouvelle cliente", async () => {
  // Après la journée validée, la commande compte pour la journée suivante (D-039).
  await deviceB.goto(`${restaurant()}/commandes/nouvelle`);
  await deviceB.getByRole("radio", { name: "À emporter" }).click();
  await deviceB.getByRole("button", { name: "Ajouter Eau minérale 50 cl", exact: true }).click();
  await deviceB.getByRole("button", { name: /Voir la commande/ }).click();
  await deviceB
    .getByRole("dialog", { name: "Commande en cours" })
    .getByRole("button", { name: "Valider la commande" })
    .click();
  await deviceB
    .getByRole("dialog", { name: "Commande enregistrée" })
    .getByRole("link", { name: "Commandes" })
    .click();

  await deviceB.getByRole("button", { name: /1× Eau minérale 50 cl/ }).click();
  await deviceB.getByRole("button", { name: "Vendre à crédit" }).click();
  const sheet = deviceB.getByRole("dialog", { name: /^Vente à crédit/ });
  await sheet.getByRole("button", { name: "Nouveau client" }).click();
  await sheet.getByLabel("Nom du client").fill("Maman Rose E2E");
  await sheet.getByLabel("Téléphone").fill("+243 990 000 123");
  await sheet.getByLabel("Motif").fill("Cliente habituelle, paiera vendredi");
  await sheet.getByRole("button", { name: "Vendre à crédit" }).click();
  await expect(sheet).toBeHidden();
  await waitForSync(deviceB);

  await deviceB.goto(`${restaurant()}/clients`);
  await expect(deviceB.getByText("Maman Rose E2E").first()).toBeVisible();
});

test("RG-CLO-02, EF-CLO-05 : la gérante corrige la caisse puis clôture la période", async ({
  page,
}) => {
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await page.goto(`/e/${ready().slug}/clotures`);
  await expect(page.getByRole("heading", { name: "Clôtures", level: 1 })).toBeVisible();

  // Correction datée et motivée : 500 FC retrouvés dans la caisse de la gérante.
  await page.getByRole("button", { name: "Corriger une journée" }).click();
  const sheet = page.getByRole("dialog", { name: "Corriger une journée validée" });
  await sheet.getByLabel("Personne").selectOption({ label: ready().manager.name });
  await sheet.getByRole("radio", { name: "Argent retrouvé" }).check();
  await sheet.getByLabel("Montant (FC)").fill("500");
  await sheet.getByLabel("Motif").fill("Billet retrouvé sous le tiroir");
  await sheet.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(sheet).toBeHidden();
  const corrections = page.getByRole("region", { name: "Corrections" });
  await expect(corrections.getByText("+500 FC")).toBeVisible();

  // Période d'une journée : aperçu, puis clôture définitive.
  await page.getByRole("button", { name: "Voir le résumé" }).click();
  await expect(page.getByText("Ventes", { exact: true })).toBeVisible();
  await expect(page.getByText("+500 FC").first()).toBeVisible();
  await page.getByRole("button", { name: /^Clôturer la période/ }).click();
  await expect(page.getByText("Période clôturée : son résumé est figé")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Périodes clôturées" }).getByText(/7\s000\sFC de ventes/),
  ).toBeVisible();
  // Ses journées ne se corrigent plus.
  await expect(page.getByRole("button", { name: "Corriger une journée" })).toBeDisabled();
});

test("EF-RAP-01, EF-RAP-04 : la gérante consulte le rapport et l'exporte en Excel et en PDF", async ({
  page,
}) => {
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await page.goto(`/e/${ready().slug}/rapports`);
  await expect(page.getByRole("heading", { name: "Rapports", level: 1 })).toBeVisible();
  const top = page.getByRole("region", { name: "Les plus vendus" });
  await expect(top.getByText("Primus 72 cl")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Par point de service" }).getByText("Comptoir"),
  ).toBeVisible();

  for (const [label, extension] of [
    ["Exporter le rapport en Excel", ".xlsx"],
    ["Exporter le rapport en PDF", ".pdf"],
  ] as const) {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: label }).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^rapport-.*\\${extension}$`));
  }
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
  await expect(page.getByText("7 000 FC").filter({ visible: true }).first()).toBeVisible();
  // EF-PRO-01, D-063 : la dette de la cliente apparaît, nommée.
  const debts = page.getByRole("region", { name: "Dettes clients" });
  await expect(debts.getByText("1 000 FC").first()).toBeVisible();
  await expect(debts.getByText("Maman Rose E2E")).toBeVisible();
});

test("EF-CPT-04 : le gérant voit les deux appareils appairés", async ({ page }) => {
  await login(page, ready().manager);
  await expect(page).toHaveURL(/\/compte/);
  await page.goto(`/e/${ready().slug}/appareils`);
  await expect(page.getByText("Téléphone salle E2E")).toBeVisible();
  await expect(page.getByText("Tablette comptoir E2E")).toBeVisible();
});
