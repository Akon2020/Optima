-- Vente à crédit et fiches clients (EF-ENC-03, EF-VTE-05, EF-TRE-03, D-037, D-043, D-059).

-- AlterTable
ALTER TABLE "advance_invoices" ADD COLUMN     "credit_request_id" UUID,
ADD COLUMN     "credited_minor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "adjustment_requests" ADD COLUMN     "customer_id" UUID;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "credit_limit_minor" BIGINT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_establishment_id_phone_key" ON "customers"("establishment_id", "phone");


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────
-- Les fiches clients se modifient (plafond de crédit) : pas de trigger d'ajout
-- seul, mais jamais de suppression (archivage) ; chaque changement est audité.

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY establishment_isolation ON customers
  USING (establishment_id = app_establishment_id() OR app_is_owner())
  WITH CHECK (establishment_id = app_establishment_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optima_app') THEN
    GRANT SELECT, INSERT, UPDATE ON customers TO optima_app;
  END IF;
END $$;
