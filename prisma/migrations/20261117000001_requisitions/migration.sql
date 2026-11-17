-- Réquisitions du magasin vers les points de service (EF-REQ-01, EF-REQ-02,
-- RG-REQ-01), D-Q14 tranchée (D-069). Ajout seul : une réquisition ne se
-- modifie plus ; une erreur se corrige par un retour au magasin.

-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "service_point_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisitions_establishment_id_day_idx" ON "requisitions"("establishment_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_establishment_id_number_key" ON "requisitions"("establishment_id", "number");


ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_kind_check"
  CHECK ("kind" IN ('main', 'complement', 'return'));
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_return_reason_check"
  CHECK ("kind" <> 'return' OR length(coalesce("comment", '')) >= 3);


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

ALTER TABLE "requisitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requisitions" FORCE ROW LEVEL SECURITY;
CREATE POLICY establishment_isolation ON "requisitions"
  USING (establishment_id = app_establishment_id() OR app_is_owner())
  WITH CHECK (establishment_id = app_establishment_id());
-- RG-REQ-01 : une réquisition validée ne se modifie plus.
CREATE TRIGGER requisitions_append_only BEFORE UPDATE OR DELETE ON "requisitions"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optima_app') THEN
    GRANT SELECT, INSERT ON requisitions TO optima_app;
  END IF;
END $$;
