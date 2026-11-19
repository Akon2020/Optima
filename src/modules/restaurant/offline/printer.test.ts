import { describe, expect, it, vi } from "vitest";

import { closePrinter, printerKind, sendToPrinter, type PrinterPort } from "./printer";

/** Imprimante simulée : garde les paquets reçus. */
function fakePort(options: { alreadyOpen?: boolean; bluetooth?: boolean } = {}) {
  const chunks: Uint8Array[] = [];
  const open = vi.fn(async () => {
    if (options.alreadyOpen) throw new DOMException("déjà ouvert", "InvalidStateError");
  });
  const port: PrinterPort = {
    open,
    close: vi.fn(async () => {}),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
    getInfo: () => (options.bluetooth ? { bluetoothServiceClassId: 0x1101 } : { usbVendorId: 1 }),
  };
  return { port, chunks, open };
}

describe("imprimante Web Serial (D-074)", () => {
  it("ouvre le port une fois et envoie le ticket par petits paquets", async () => {
    const { port, chunks, open } = fakePort({ bluetooth: true });
    const bytes = Uint8Array.from({ length: 600 }, (_, index) => index % 256);
    await sendToPrinter(port, bytes);
    await sendToPrinter(port, Uint8Array.from([1, 2, 3]));
    expect(open).toHaveBeenCalledTimes(1);
    expect(chunks.map((chunk) => chunk.length)).toEqual([256, 256, 88, 3]);
    expect([...chunks.slice(0, 3).flatMap((chunk) => [...chunk])]).toEqual([...bytes]);
    expect(printerKind(port)).toBe("bluetooth");
  });

  it("accepte un port déjà ouvert, et le rouvre après une fermeture", async () => {
    const { port, chunks, open } = fakePort({ alreadyOpen: true });
    await sendToPrinter(port, Uint8Array.from([7]));
    expect(chunks).toHaveLength(1);
    await closePrinter(port);
    await sendToPrinter(port, Uint8Array.from([8]));
    expect(open).toHaveBeenCalledTimes(2);
    expect(printerKind(port)).toBe("usb");
  });
});
