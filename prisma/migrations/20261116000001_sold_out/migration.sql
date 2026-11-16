-- Élément déclaré épuisé par un poste de préparation, pour une journée (EF-PRE-03, D-066).

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "sold_out_day" TEXT;
