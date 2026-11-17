import type { Db } from "../db/context";
import { withContext } from "../db/context";

/**
 * Module actif dans un établissement (lecture sous RLS). Sert à l'affichage,
 * par exemple la charte Restaurant (D-017) : les droits restent vérifiés par
 * `authorize`.
 */
export async function isModuleEnabled(
  db: Db,
  establishmentId: string,
  module: string,
): Promise<boolean> {
  const row = await withContext(db, { establishmentId, isOwner: false }, (tx) =>
    tx.establishmentModule.findUnique({
      where: { establishmentId_module: { establishmentId, module } },
      select: { enabled: true },
    }),
  );
  return row?.enabled === true;
}
