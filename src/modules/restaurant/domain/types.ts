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

export type DiningTable = {
  id: string;
  establishmentId: string;
  label: string;
  sortOrder: number;
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
export type PaymentStatus = "unpaid" | "paid" | "cancelled";

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

/** Stock du matin d'un élément de menu pour une journée (EF-REQ-03). */
export type MorningStock = {
  id: string;
  establishmentId: string;
  menuItemId: string;
  day: string;
  quantity: number;
  enteredAt: string;
  enteredBy: string;
};

export type StaffMember = {
  id: string;
  establishmentId: string;
  name: string;
  role: "manager" | "waiter";
};
