-- Make revenue and cost fields optional on rms_projects
ALTER TABLE "rms_projects" ALTER COLUMN "revenue_cents" DROP NOT NULL;
ALTER TABLE "rms_projects" ALTER COLUMN "revenue_cents" DROP DEFAULT;
ALTER TABLE "rms_projects" ALTER COLUMN "expected_compute_cost_cents" DROP NOT NULL;
ALTER TABLE "rms_projects" ALTER COLUMN "expected_compute_cost_cents" DROP DEFAULT;

-- Make pnl_snapshots fields optional
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "revenue_cents" DROP NOT NULL;
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "total_employee_cost_cents" DROP NOT NULL;
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "total_compute_cost_cents" DROP NOT NULL;
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "total_cost_cents" DROP NOT NULL;
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "gross_margin_cents" DROP NOT NULL;
ALTER TABLE "rms_pnl_snapshots" ALTER COLUMN "is_in_red" DROP NOT NULL;
