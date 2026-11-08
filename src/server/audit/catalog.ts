/**
 * Catalogue du journal d'audit (EF-AUD-02) : libellés français des actions,
 * domaines de filtrage et lecture des changements « avant / après ».
 * Fonctions pures, utilisables à l'écran comme dans les exports.
 */

export const AUDIT_DOMAINS = [
  { id: "auth", label: "Connexions et sécurité" },
  { id: "core.staff", label: "Équipe" },
  { id: "core.device", label: "Appareils" },
  { id: "owner", label: "Propriétaire" },
  { id: "restaurant", label: "Restaurant" },
  { id: "audit", label: "Journal" },
] as const;

export type AuditDomain = (typeof AUDIT_DOMAINS)[number]["id"];

export function isAuditDomain(value: string): value is AuditDomain {
  return AUDIT_DOMAINS.some((domain) => domain.id === value);
}

/** Préfixes d'actions qui composent un domaine (pour la requête). */
export function domainPrefixes(domain: AuditDomain): string[] {
  if (domain === "audit") return ["core.audit.", "owner.audit."];
  if (domain === "owner") return ["owner.establishment.", "owner.module."];
  return [`${domain}.`];
}

/** Domaine d'une action, cohérent avec les préfixes utilisés par les filtres. */
export function domainOf(action: string): AuditDomain | null {
  return (
    AUDIT_DOMAINS.find((domain) =>
      domainPrefixes(domain.id).some((prefix) => action.startsWith(prefix)),
    )?.id ?? null
  );
}

export const ACTION_LABELS: Record<string, string> = {
  "auth.login.succeeded": "Connexion réussie",
  "auth.login.failed": "Échec de connexion",
  "auth.password.changed": "Mot de passe changé",
  "auth.totp.enabled": "Double authentification activée",
  "auth.device-login.succeeded": "Connexion sur un appareil",
  "auth.device-login.failed": "Échec de connexion sur un appareil",
  "auth.device-login.refused": "Connexion refusée sur un appareil",
  "core.device.registered": "Appareil appairé",
  "core.device.revoked": "Appareil révoqué",
  "core.staff.created": "Compte créé",
  "core.staff.updated": "Compte modifié",
  "core.staff.password-reset": "Mot de passe réinitialisé",
  "core.staff.signed-out": "Déconnexion forcée",
  "core.staff.suspended": "Accès suspendu",
  "core.staff.reactivated": "Accès réactivé",
  "core.audit.exported": "Journal exporté",
  "owner.audit.exported": "Journal exporté (tous les établissements)",
  "owner.establishment.created": "Établissement créé",
  "owner.establishment.updated": "Identité de l'établissement modifiée",
  "owner.establishment.suspended": "Établissement suspendu",
  "owner.establishment.reactivated": "Établissement réactivé",
  "owner.module.enabled": "Module activé",
  "owner.module.disabled": "Module désactivé",
  "restaurant.menu-item.created": "Élément de menu ajouté",
  "restaurant.morning-stock.entered": "Stock du matin saisi",
  "restaurant.table.created": "Table ajoutée",
  "restaurant.table.renamed": "Table renommée",
  "restaurant.table.archived": "Table retirée du service",
  "restaurant.table.restored": "Table remise en service",
};

/** Motifs techniques enregistrés par le serveur (refus de connexion), en français. */
const REASON_LABELS: Record<string, string> = {
  SUSPENDED: "compte suspendu",
  OWNER_NOT_ON_DEVICE: "le propriétaire ne travaille pas sur un appareil partagé",
  MUST_CHANGE_PASSWORD: "mot de passe provisoire pas encore changé",
  NOT_A_MEMBER: "compte d'un autre établissement",
};

export function reasonLabel(reason: string | null): string | null {
  return reason ? (REASON_LABELS[reason] ?? reason) : null;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  waiter: "Serveur",
  prep: "Poste de préparation",
  courier: "Livreur",
  reader: "Lecteur",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  legalName: "Raison sociale",
  address: "Adresse",
  phone: "Téléphone",
  role: "Rôle",
  servicePointId: "Point de service",
  identifier: "Identifiant",
  code: "Code",
  slug: "Adresse OPTIMA",
  type: "Type",
  currency: "Devise",
  timeZone: "Fuseau horaire",
  modules: "Modules",
  module: "Module",
  sessions: "Sessions fermées",
  label: "Libellé",
  price: "Prix",
  quantity: "Quantité",
};

export type AuditChange = { field: string; before: string | null; after: string | null };

function display(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map((item) => display(item) ?? "").join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Champs modifiés entre « avant » et « après » (ou valeurs enregistrées). */
export function describeChanges(before: unknown, after: unknown): AuditChange[] {
  const previous = asRecord(before);
  const next = asRecord(after);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])];
  return keys
    .map((key) => {
      const show = (value: unknown) => {
        const text = display(value);
        return key === "role" && text ? (ROLE_LABELS[text] ?? text) : text;
      };
      return {
        field: FIELD_LABELS[key] ?? key,
        before: show(previous[key]),
        after: show(next[key]),
      };
    })
    .filter((change) => change.before !== change.after);
}
