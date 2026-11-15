import type { Money } from "@/shared/lib/money";

/** Points de service du restaurant (EF-RES-01, D-007). */
export type ServicePointKind = "counter" | "kitchen" | "grill";

/** Les deux menus proposés aux serveurs (EF-RES-02). */
export type MenuKind = "drinks" | "food";

/** Unités de vente (EF-RES-03) : bouteille, plat, morceau. */
export type SaleUnit = "bottle" | "dish" | "piece";

export type ServicePoint = {
  id: string;
  establishmentId: string;
  kind: ServicePointKind;
  name: string;
  menu: MenuKind;
  sortOrder: number;
};

export type MenuItem = {
  id: string;
  establishmentId: string;
  servicePointId: string;
  name: string;
  description: string;
  category: string;
  unit: SaleUnit;
  /** `null` : prix non fixé, l'article ne se vend pas (RG-PRX-01). */
  price: Money | null;
  createdAt: string;
  /** Un article ne se supprime pas, il s'archive (RG-CAT-01). */
  archivedAt: string | null;
};

/** Table de la salle, créée et numérotée par le gérant (EF-RES-04). */
export type DiningTable = {
  id: string;
  establishmentId: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  /** Une table ne se supprime pas (des commandes y font référence) : elle s'archive. */
  archivedAt: string | null;
};

/**
 * Libération d'une table : les commandes suivantes ouvrent une nouvelle
 * occupation. Journal en ajout seul.
 */
export type TableRelease = {
  id: string;
  establishmentId: string;
  tableId: string;
  releasedAt: string;
  releasedBy: string;
  releasedByName: string;
};

export type OrderMode = "dine-in" | "takeaway" | "delivery";

export type OrderLine = {
  menuItemId: string;
  name: string;
  servicePointId: string;
  unit: SaleUnit;
  /** Prix figé au moment de la commande (RG-RES-02). */
  unitPrice: Money;
  quantity: number;
};

export type PrepStatus = "pending" | "ready" | "served";
/**
 * Statut de paiement d'une facture. Sur l'appareil, « partiellement payée » et
 * « payée » se déduisent des paiements (`domain/payment.ts`) ; seule
 * l'annulation est portée par la facture elle-même.
 */
export type PaymentStatus = "unpaid" | "partial" | "paid" | "cancelled";

/** Facture d'avance : une par point de service concerné (EF-CMD-02, EF-CMD-03). */
export type AdvanceInvoice = {
  id: string;
  establishmentId: string;
  orderId: string;
  servicePointId: string;
  number: string;
  mode: OrderMode;
  tableLabel: string | null;
  waiterId: string;
  waiterName: string;
  deviceCode: string;
  createdAt: string;
  lines: OrderLine[];
  total: Money;
  prepStatus: PrepStatus;
  paymentStatus: PaymentStatus;
  /** Remise accordée par le gérant (RG-ENC-01), absente des enregistrements anciens. */
  discount?: Money;
  /** Motif de l'annulation validée par le gérant (RG-CMD-02). */
  cancelReason?: string | null;
  /**
   * Vente à crédit validée (EF-ENC-03, D-059) : la demande qui a fait de ce reste
   * une dette client. La facture n'est plus un impayé du serveur (RG-ENC-02).
   */
  creditRequestId?: string | null;
  /** Montant converti en dette à la validation. */
  credited?: Money;
};

export type Order = {
  id: string;
  establishmentId: string;
  number: string;
  mode: OrderMode;
  tableId: string | null;
  tableLabel: string | null;
  waiterId: string;
  waiterName: string;
  deviceCode: string;
  createdAt: string;
  lines: OrderLine[];
  total: Money;
  invoiceIds: string[];
};

/**
 * Saisie du stock du matin d'un élément (EF-REQ-03). Les saisies ne sont
 * jamais modifiées : une correction ajoute une nouvelle saisie qui remplace
 * la précédente (`replacesId`), l'historique reste consultable.
 */
export type MorningStockEntry = {
  id: string;
  establishmentId: string;
  day: string;
  servicePointId: string;
  menuItemId: string;
  quantity: number;
  /** Quantité proposée par le logiciel (EF-REQ-04), `null` sans base de calcul. */
  proposed: number | null;
  /** Motif obligatoire dès qu'il y a un écart ou une correction (RG-REQ-02). */
  reason: string | null;
  replacesId: string | null;
  enteredAt: string;
  enteredBy: string;
  enteredByName: string;
};

/**
 * Taux de change saisi par le gérant (EF-PRX-05, D-042) : « 1 USD = `rate`
 * CDF ». Un taux ne se modifie jamais : on en ajoute un nouveau (RG-PRX-02).
 */
export type ExchangeRate = {
  id: string;
  establishmentId: string;
  /** Nombre décimal en texte (6 décimales au plus), jamais un flottant. */
  rate: string;
  effectiveAt: string;
  enteredBy: string;
  enteredByName: string;
};

export type PaymentMethod = "cash" | "mobile-money";
export type MobileMoneyProvider = "mpesa" | "orange-money" | "airtel-money";

/** Part d'un paiement affectée à une facture d'avance, en devise de base. */
export type PaymentAllocation = { invoiceId: string; amount: Money };

/**
 * Paiement reçu (EF-ENC-02, D-032). Fait en ajout seul : un paiement ne se
 * modifie pas. `tendered` est ce que le client a donné, dans sa devise ;
 * `baseAmount` sa contre-valeur au taux figé (RG-PRX-02) ; `change` la
 * monnaie rendue en espèces, en devise de base. Les affectations totalisent
 * `baseAmount − change` (à l'arrondi de conversion près, voir `payment.ts`).
 */
export type Payment = {
  id: string;
  establishmentId: string;
  method: PaymentMethod;
  provider: MobileMoneyProvider | null;
  reference: string | null;
  tendered: Money;
  /** Taux appliqué, `null` si le client paie dans la devise de base. */
  rate: { id: string; rate: string } | null;
  baseAmount: Money;
  change: Money;
  allocations: PaymentAllocation[];
  /** Personne qui a reçu l'argent (D-032) : le serveur, ou un gérant à sa place. */
  collectedBy: string;
  collectedByName: string;
  deviceCode: string;
  createdAt: string;
};

/** Mode de paiement détenu à la clôture : déclaré compté face à l'attendu (EF-CLO-01, 02). */
export type CashClosingLine = {
  key: string;
  method: PaymentMethod;
  provider: MobileMoneyProvider | null;
  expected: Money;
  counted: Money;
};

/**
 * Clôture de caisse d'une personne qui a encaissé (D-032, EF-CLO-01, 02) :
 * elle couvre ses paiements qui ne figurent dans aucune clôture précédente.
 * Figée une fois déclarée (ajout seul).
 */
export type CashClosing = {
  id: string;
  establishmentId: string;
  /** Journée d'exploitation de la déclaration (clé `AAAA-MM-JJ`). */
  day: string;
  userId: string;
  userName: string;
  deviceCode: string;
  declaredAt: string;
  paymentIds: string[];
  lines: CashClosingLine[];
  /** Part encaissée revenant à chaque point de service, en devise de base. */
  byServicePoint: { servicePointId: string; amount: Money }[];
  /** RG-ENC-02 : factures de la personne encore impayées au moment de la clôture. */
  unpaidInvoiceIds: string[];
  comment: string | null;
};

/** Ligne du comptage de fin de service d'un point de service (EF-CLO-03). */
export type StockCountLine = {
  menuItemId: string;
  name: string;
  unit: SaleUnit;
  /** Stock du matin en vigueur, `null` s'il n'a pas été saisi. */
  morning: number | null;
  sold: number;
  /** Pertes, casse, repas du personnel, offerts : déclarés à part, avec un motif (D-044). */
  declaredOut: number;
  outReason: string | null;
  counted: number;
};

export type StockCount = {
  id: string;
  establishmentId: string;
  day: string;
  servicePointId: string;
  countedAt: string;
  countedBy: string;
  countedByName: string;
  lines: StockCountLine[];
  comment: string | null;
};

/**
 * Validation de la journée par le gérant (EF-CLO-04, D-039) : elle fige les
 * clôtures de caisse et les comptages (RG-CLO-02).
 */
export type DayClosing = {
  id: string;
  establishmentId: string;
  day: string;
  validatedAt: string;
  validatedBy: string;
  validatedByName: string;
  cashClosingIds: string[];
  stockCountIds: string[];
  comment: string | null;
};

/** Ajustement d'une commande soumis au gérant (RG-CMD-02, RG-VTE-02, RG-ENC-01). */
export type AdjustmentKind = "cancel" | "discount" | "credit";

/**
 * Demande d'annulation ou de remise : le serveur demande, le gérant valide
 * (matrice des droits). Fait en ajout seul ; la décision est un fait séparé.
 */
export type AdjustmentRequest = {
  id: string;
  establishmentId: string;
  kind: AdjustmentKind;
  orderId: string;
  invoiceIds: string[];
  reason: string;
  /** Remise demandée, en devise de base ; `null` pour une annulation ou un crédit. */
  discount: Money | null;
  /** Client débiteur d'une vente à crédit (D-059) ; `null` sinon. */
  customerId: string | null;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  deviceCode: string;
};

export type AdjustmentDecision = {
  id: string;
  establishmentId: string;
  requestId: string;
  approved: boolean;
  comment: string | null;
  /** Remise répartie entre les factures, fixée à l'approbation. */
  discounts: PaymentAllocation[];
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
};

/** Fiche client, tenue pour la vente à crédit (D-043, EF-ENC-03). */
export type Customer = {
  id: string;
  establishmentId: string;
  name: string;
  /** Numéro normalisé (chiffres, + initial), unique dans l'établissement. */
  phone: string;
  /** Plafond de crédit fixé par le gérant (D-037) ; `null` : pas de plafond. */
  creditLimit: Money | null;
  createdAt: string;
  createdBy: string;
};

export type StaffMember = {
  id: string;
  establishmentId: string;
  name: string;
  role: "manager" | "waiter" | "prep" | "courier" | "reader";
};
