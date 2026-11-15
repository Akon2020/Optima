-- Écritures d'ajustement (RG-CLO-02) et clôtures de période (EF-CLO-05), D-064.

-- CreateTable
CREATE TABLE "closing_adjustments" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "user_id" UUID,
    "currency" CHAR(3),
    "amount_minor" BIGINT,
    "service_point_id" UUID,
    "menu_item_id" UUID,
    "quantity" INTEGER,
    "reason" TEXT NOT NULL,
    "adjusted_by" UUID NOT NULL,
    "adjusted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closing_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_closings" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "from_day" TEXT NOT NULL,
    "to_day" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "comment" TEXT,
    "validated_by" UUID NOT NULL,
    "validated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "closing_adjustments_establishment_id_day_idx" ON "closing_adjustments"("establishment_id", "day");

-- CreateIndex
CREATE INDEX "period_closings_establishment_id_from_day_idx" ON "period_closings"("establishment_id", "from_day");


ALTER TABLE "closing_adjustments" ADD CONSTRAINT "closing_adjustments_kind_check"
  CHECK ("kind" IN ('cash', 'stock'));
ALTER TABLE "closing_adjustments" ADD CONSTRAINT "closing_adjustments_shape_check" CHECK (
  ("kind" = 'cash' AND "user_id" IS NOT NULL AND "currency" IS NOT NULL
     AND "amount_minor" IS NOT NULL AND "amount_minor" <> 0)
  OR ("kind" = 'stock' AND "service_point_id" IS NOT NULL AND "menu_item_id" IS NOT NULL
     AND "quantity" IS NOT NULL AND "quantity" <> 0)
);
ALTER TABLE "period_closings" ADD CONSTRAINT "period_closings_range_check"
  CHECK ("from_day" <= "to_day");


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['closing_adjustments', 'period_closings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
    -- RG-CLO-02 : une écriture et une clôture de période ne se modifient plus.
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
    GRANT SELECT, INSERT ON closing_adjustments, period_closings TO optima_app;
  END IF;
END $$;
