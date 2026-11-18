-- Livraison (EF-LIV-01 à 04, D-070, D-071) : zones et frais fixés par le
-- gérant, livraisons et leur historique horodaté. Les frais sont une facture
-- d'avance sans point de service.

-- La facture des frais de livraison n'appartient à aucun point de service.
ALTER TABLE "advance_invoices" ALTER COLUMN "service_point_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fee_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "zone_name" TEXT NOT NULL,
    "fee_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fee_invoice_id" UUID,
    "desired_time" TEXT,
    "courier_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "courier_id" UUID,
    "note" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_zones_establishment_id_idx" ON "delivery_zones"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_establishment_id_created_at_idx" ON "deliveries"("establishment_id", "created_at");

-- CreateIndex
CREATE INDEX "delivery_events_delivery_id_idx" ON "delivery_events"("delivery_id");


ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_fee_check" CHECK ("fee_minor" >= 0);
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_status_check"
  CHECK ("status" IN ('preparing', 'en-route', 'delivered', 'failed'));
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_kind_check"
  CHECK ("kind" IN ('preparing', 'assigned', 'en-route', 'delivered', 'failed'));


-- ─── Sécurité (mêmes règles que 20261107000002_security) ────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['delivery_zones', 'deliveries', 'delivery_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY establishment_isolation ON %I
         USING (establishment_id = app_establishment_id() OR app_is_owner())
         WITH CHECK (establishment_id = app_establishment_id())',
      t
    );
  END LOOP;
END $$;

-- EF-LIV-03 : chaque changement est horodaté et ne se modifie plus.
CREATE TRIGGER delivery_events_append_only BEFORE UPDATE OR DELETE ON "delivery_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optima_app') THEN
    GRANT SELECT, INSERT, UPDATE ON delivery_zones, deliveries TO optima_app;
    GRANT SELECT, INSERT ON delivery_events TO optima_app;
  END IF;
END $$;
