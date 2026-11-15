/**
 * Téléchargement dans le navigateur d'un fichier reçu en base64 d'une Server
 * Action (exports du journal et des rapports). Côté client seulement.
 */
export function downloadBase64(base64: string, mimeType: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
