-- Encaissement (EF-ENC-02, D-032, D-033) et taux du dollar (EF-PRX-05, D-042).
-- Tables en ajout seul, isolées par établissement (CLAUDE.md § 3.8).

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "provider" TEXT,
    "reference" TEXT,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "exchange_rate_id" UUID,
    "rate" DECIMAL(18,6),
    "base_currency" CHAR(3) NOT NULL,
    "base_amount_minor" BIGINT NOT NULL,
    "change_minor" BIGINT NOT NULL,
    "collected_by" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_establishment_id_effective_at_idx" ON "exchange_rates"("establishment_id", "effective_at");

-- CreateIndex
CREATE INDEX "payments_establishment_id_created_at_idx" ON "payments"("establishment_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_establishment_id_collected_by_idx" ON "payments"("establishment_id", "collected_by");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_establishment_id_invoice_id_idx" ON "payment_allocations"("establishment_id", "invoice_id");

-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exchange_rates', 'payments', 'payment_allocations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
    -- RG-PRX-02 (un taux ne se modifie pas), RG-OFF-03 (les paiements s'additionnent).
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
    GRANT SELECT, INSERT ON exchange_rates, payments, payment_allocations TO optima_app;
  END IF;
END $$;
