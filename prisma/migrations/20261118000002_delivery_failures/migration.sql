-- Livraison échouée (RG-LIV-01, D-073) : le gérant déclare les plats
-- rapportés réutilisables ou perdus ; la décision entre dans l'historique.

ALTER TABLE "deliveries" ADD COLUMN "failure_outcome" TEXT;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_failure_outcome_check"
  CHECK ("failure_outcome" IS NULL OR ("failure_outcome" IN ('reusable', 'lost') AND "status" = 'failed'));

ALTER TABLE "delivery_events" DROP CONSTRAINT "delivery_events_kind_check";
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_kind_check"
  CHECK ("kind" IN ('preparing', 'assigned', 'en-route', 'delivered', 'failed', 'settled'));
