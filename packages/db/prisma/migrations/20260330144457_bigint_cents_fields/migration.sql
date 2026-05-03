-- AlterTable
ALTER TABLE "rms_projects" ALTER COLUMN "revenue_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "expected_compute_cost_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "expected_revenue_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "sub_practice_1_amount_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "sub_practice_2_amount_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "sub_practice_3_amount_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "sub_practice_4_amount_cents" SET DATA TYPE BIGINT,
ALTER COLUMN "total_deal_amount_cents" SET DATA TYPE BIGINT;
