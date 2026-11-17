-- Éléments avec options et formules (D-035, D-060).

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "components" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'simple',
ADD COLUMN     "option_groups" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "formula_item_id" UUID,
ADD COLUMN     "formula_line_id" TEXT,
ADD COLUMN     "formula_name" TEXT,
ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]';

-- Deux sortes d'éléments seulement ; tables déjà protégées par la RLS.
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_kind_check" CHECK ("kind" IN ('simple', 'formula'));
