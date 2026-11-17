-- Clôtures de service (EF-CLO-01 à 04, RG-CLO-01 à 03, D-039, D-056).
-- Tables en ajout seul, isolées par établissement (CLAUDE.md § 3.8).

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "pending_operations" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cash_closings" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL,
    "lines" JSONB NOT NULL,
    "by_service_point" JSONB NOT NULL,
    "unpaid_invoice_ids" JSONB NOT NULL,
    "comment" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closing_payments" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "closing_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,

    CONSTRAINT "cash_closing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "service_point_id" UUID NOT NULL,
    "counted_at" TIMESTAMPTZ(6) NOT NULL,
    "counted_by" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "comment" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_closings" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "validated_at" TIMESTAMPTZ(6) NOT NULL,
    "validated_by" UUID NOT NULL,
    "cash_closing_ids" JSONB NOT NULL,
    "stock_count_ids" JSONB NOT NULL,
    "comment" TEXT,

    CONSTRAINT "day_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_closings_establishment_id_day_idx" ON "cash_closings"("establishment_id", "day");

-- CreateIndex
CREATE INDEX "cash_closing_payments_closing_id_idx" ON "cash_closing_payments"("closing_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closing_payments_establishment_id_payment_id_key" ON "cash_closing_payments"("establishment_id", "payment_id");

-- CreateIndex
CREATE INDEX "stock_counts_establishment_id_day_idx" ON "stock_counts"("establishment_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "day_closings_establishment_id_day_key" ON "day_closings"("establishment_id", "day");


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_closings', 'cash_closing_payments', 'stock_counts', 'day_closings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
    -- RG-CLO-02 : une clôture ne se modifie plus ; une erreur se corrige par ajustement.
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION forbid_update_delete()',
      t || '_append_only',
      t
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optima_app') THEN
    GRANT SELECT, INSERT ON cash_closings, cash_closing_payments, stock_counts, day_closings
      TO optima_app;
  END IF;
END $$;
