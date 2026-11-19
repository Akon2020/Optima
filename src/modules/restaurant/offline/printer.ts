/**
 * Imprimante thermique de l'appareil (EF-DOC-02, D-074) : connexion par
 * l'API Web Serial de Chrome, sur le Bluetooth classique (profil SPP) ou en
 * USB. Le ticket arrive déjà encodé en ESC/POS (`domain/receipt.ts`).
 *
 * Aucune bibliothèque : l'API du navigateur suffit. Ses types n'étant pas
 * dans TypeScript, seules les méthodes utilisées sont décrites ici.
 */
import type { PaperWidth } from "../domain/receipt";

type SerialPortInfo = { usbVendorId?: number; bluetoothServiceClassId?: number | string };

export type PrinterPort = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
};

type Serial = {
  requestPort(options?: { allowedBluetoothServiceClassIds?: string[] }): Promise<PrinterPort>;
  getPorts(): Promise<PrinterPort[]>;
};

/** Profil série Bluetooth (SPP), celui des imprimantes thermiques courantes. */
const SPP_SERVICE = "00001101-0000-1000-8000-00805f9b34fb";
/** Débit habituel ; ignoré en Bluetooth, où RFCOMM règle le débit. */
const BAUD_RATE = 9600;
/** Petits paquets : le tampon des imprimantes Bluetooth est court. */
const CHUNK_SIZE = 256;
const CHUNK_DELAY_MS = 20;

const PAPER_KEY = "optima:printer:paper";

function serial(): Serial | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: Serial }).serial ?? null;
}

/** Le navigateur peut-il piloter une imprimante (Chrome récent, contexte sécurisé) ? */
export function isPrinterSupported(): boolean {
  return serial() !== null;
}

/** Imprimante déjà autorisée sur cet appareil, s'il y en a une. */
export async function knownPrinter(): Promise<PrinterPort | null> {
  const api = serial();
  if (!api) return null;
  const ports = await api.getPorts();
  return ports[0] ?? null;
}

/**
 * Demande à l'utilisateur de choisir l'imprimante. Elle doit d'abord être
 * appairée dans les réglages Bluetooth du téléphone, ou branchée en USB.
 */
export async function choosePrinter(): Promise<PrinterPort> {
  const api = serial();
  if (!api) throw new Error("Ce navigateur ne sait pas piloter une imprimante.");
  return api.requestPort({ allowedBluetoothServiceClassIds: [SPP_SERVICE] });
}

export function printerKind(port: PrinterPort): "bluetooth" | "usb" {
  return port.getInfo().bluetoothServiceClassId !== undefined ? "bluetooth" : "usb";
}

const opened = new WeakSet<PrinterPort>();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Envoie un ticket encodé ; ouvre le port au premier envoi et le garde ouvert. */
export async function sendToPrinter(port: PrinterPort, bytes: Uint8Array): Promise<void> {
  if (!opened.has(port)) {
    try {
      await port.open({ baudRate: BAUD_RATE });
    } catch (error) {
      // Déjà ouvert par un envoi précédent (même page) : on continue.
      if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
    }
    opened.add(port);
  }
  if (!port.writable) throw new Error("L'imprimante ne répond pas : rallumez-la puis réessayez.");
  const writer = port.writable.getWriter();
  try {
    for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
      await writer.write(bytes.slice(start, start + CHUNK_SIZE));
      if (start + CHUNK_SIZE < bytes.length) await wait(CHUNK_DELAY_MS);
    }
  } finally {
    writer.releaseLock();
  }
}

/** Ferme le port (imprimante changée ou éteinte), pour repartir proprement. */
export async function closePrinter(port: PrinterPort): Promise<void> {
  opened.delete(port);
  try {
    await port.close();
  } catch {
    // Déjà fermé.
  }
}

/** Largeur du papier choisie sur cet appareil (préférence locale). */
export function savedPaperWidth(): PaperWidth {
  try {
    return localStorage.getItem(PAPER_KEY) === "80" ? 80 : 58;
  } catch {
    return 58;
  }
}

const paperListeners = new Set<() => void>();

/** Abonnement aux changements de largeur (pour `useSyncExternalStore`). */
export function subscribePaperWidth(listener: () => void): () => void {
  paperListeners.add(listener);
  return () => paperListeners.delete(listener);
}

export function savePaperWidth(paper: PaperWidth): void {
  try {
    localStorage.setItem(PAPER_KEY, String(paper));
  } catch {
    // Stockage indisponible (navigation privée) : la largeur reste celle par défaut.
  }
  for (const listener of paperListeners) listener();
}
