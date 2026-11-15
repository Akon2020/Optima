-- Annulations et remises validées par le gérant (RG-CMD-02, RG-VTE-02, RG-ENC-01, D-058).
-- Demandes et décisions en ajout seul, isolées par établissement (CLAUDE.md § 3.8).

-- AlterTable
ALTER TABLE "advance_invoices" ADD COLUMN     "discount_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "adjustment_requests" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "invoice_ids" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "discount_minor" BIGINT,
    "requested_by" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment_decisions" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "comment" TEXT,
    "discounts" JSONB NOT NULL,
    "decided_by" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "adjustment_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adjustment_requests_establishment_id_order_id_idx" ON "adjustment_requests"("establishment_id", "order_id");

-- CreateIndex
CREATE INDEX "adjustment_requests_establishment_id_requested_at_idx" ON "adjustment_requests"("establishment_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_decisions_establishment_id_request_id_key" ON "adjustment_decisions"("establishment_id", "request_id");


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['adjustment_requests', 'adjustment_decisions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
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
    GRANT SELECT, INSERT ON adjustment_requests, adjustment_decisions TO optima_app;
  END IF;
END $$;
