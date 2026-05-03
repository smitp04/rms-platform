-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'POD_LEAD', 'CSM', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('TIME_AND_MATERIAL', 'FIXED_PRICE', 'RETAINER', 'MILESTONE_BASED');

-- CreateEnum
CREATE TYPE "DevxPillar" AS ENUM ('CUSTOMER_INTERACTION', 'MARKETING_AUTOMATION', 'AI_OPS', 'ENTERPRISE_ARCHITECTURE');

-- CreateEnum
CREATE TYPE "ComputeAllocationType" AS ENUM ('PRO_RATA', 'CUSTOM', 'LUMP_SUM');

-- CreateTable
CREATE TABLE "rms_functions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rms_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "function_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rms_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "rms_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "rms_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_technologies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "rms_technologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_employees" (
    "id" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "joining_date" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "function_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "system_role" "SystemRole" NOT NULL DEFAULT 'EMPLOYEE',
    "pod_id" TEXT,
    "ems_employee_id" TEXT,
    "salary_ctc_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rms_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_employee_platforms" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,

    CONSTRAINT "rms_employee_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_employee_skills" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "rms_employee_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_pods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rms_pods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_accounts" (
    "id" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "zoho_id" TEXT,
    "industry" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rms_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_projects" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "deal_name" TEXT NOT NULL,
    "zoho_deal_id" TEXT,
    "revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "sow_url" TEXT,
    "billing_model" "BillingModel" NOT NULL DEFAULT 'TIME_AND_MATERIAL',
    "devx_pillar" "DevxPillar" NOT NULL DEFAULT 'AI_OPS',
    "status" "ProjectStatus" NOT NULL DEFAULT 'UPCOMING',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "expected_compute_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "project_manager_id" TEXT,
    "growth_consultant_id" TEXT,
    "practice_poc_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rms_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_project_technologies" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "technology_id" TEXT NOT NULL,

    CONSTRAINT "rms_project_technologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_sprints" (
    "id" TEXT NOT NULL,
    "sprint_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rms_sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_allocations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sprint_id" TEXT NOT NULL,
    "allocation_percentage" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rms_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_employee_compute_costs" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "total_cost_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rms_employee_compute_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_project_compute_costs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "month" TEXT NOT NULL,
    "allocation_type" "ComputeAllocationType" NOT NULL,
    "allocated_percent" DOUBLE PRECISION,
    "lump_sum_cents" INTEGER,
    "computed_cost_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rms_project_compute_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_pnl_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sprint_id" TEXT NOT NULL,
    "revenue_cents" INTEGER NOT NULL,
    "total_employee_cost_cents" INTEGER NOT NULL,
    "total_compute_cost_cents" INTEGER NOT NULL,
    "total_cost_cents" INTEGER NOT NULL,
    "gross_margin_cents" INTEGER NOT NULL,
    "is_in_red" BOOLEAN NOT NULL,
    "is_projected" BOOLEAN NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rms_pnl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rms_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rms_webhook_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "rms_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rms_functions_name_key" ON "rms_functions"("name");

-- CreateIndex
CREATE INDEX "rms_roles_function_id_idx" ON "rms_roles"("function_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_roles_name_function_id_key" ON "rms_roles"("name", "function_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_skills_name_key" ON "rms_skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rms_platforms_name_key" ON "rms_platforms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rms_technologies_name_key" ON "rms_technologies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employees_google_id_key" ON "rms_employees"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employees_email_key" ON "rms_employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employees_ems_employee_id_key" ON "rms_employees"("ems_employee_id");

-- CreateIndex
CREATE INDEX "rms_employees_function_id_idx" ON "rms_employees"("function_id");

-- CreateIndex
CREATE INDEX "rms_employees_pod_id_idx" ON "rms_employees"("pod_id");

-- CreateIndex
CREATE INDEX "rms_employees_status_idx" ON "rms_employees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employee_platforms_employee_id_platform_id_key" ON "rms_employee_platforms"("employee_id", "platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employee_skills_employee_id_skill_id_key" ON "rms_employee_skills"("employee_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_pods_name_key" ON "rms_pods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rms_pods_lead_id_key" ON "rms_pods"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_accounts_brand_name_key" ON "rms_accounts"("brand_name");

-- CreateIndex
CREATE UNIQUE INDEX "rms_accounts_zoho_id_key" ON "rms_accounts"("zoho_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_projects_zoho_deal_id_key" ON "rms_projects"("zoho_deal_id");

-- CreateIndex
CREATE INDEX "rms_projects_account_id_idx" ON "rms_projects"("account_id");

-- CreateIndex
CREATE INDEX "rms_projects_status_idx" ON "rms_projects"("status");

-- CreateIndex
CREATE INDEX "rms_projects_project_manager_id_idx" ON "rms_projects"("project_manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_project_technologies_project_id_technology_id_key" ON "rms_project_technologies"("project_id", "technology_id");

-- CreateIndex
CREATE INDEX "rms_sprints_start_date_idx" ON "rms_sprints"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "rms_sprints_sprint_number_year_key" ON "rms_sprints"("sprint_number", "year");

-- CreateIndex
CREATE INDEX "rms_allocations_sprint_id_idx" ON "rms_allocations"("sprint_id");

-- CreateIndex
CREATE INDEX "rms_allocations_employee_id_idx" ON "rms_allocations"("employee_id");

-- CreateIndex
CREATE INDEX "rms_allocations_project_id_idx" ON "rms_allocations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_allocations_employee_id_project_id_sprint_id_key" ON "rms_allocations"("employee_id", "project_id", "sprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_employee_compute_costs_employee_id_month_key" ON "rms_employee_compute_costs"("employee_id", "month");

-- CreateIndex
CREATE INDEX "rms_project_compute_costs_project_id_month_idx" ON "rms_project_compute_costs"("project_id", "month");

-- CreateIndex
CREATE INDEX "rms_pnl_snapshots_is_in_red_idx" ON "rms_pnl_snapshots"("is_in_red");

-- CreateIndex
CREATE INDEX "rms_pnl_snapshots_sprint_id_idx" ON "rms_pnl_snapshots"("sprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "rms_pnl_snapshots_project_id_sprint_id_key" ON "rms_pnl_snapshots"("project_id", "sprint_id");

-- CreateIndex
CREATE INDEX "rms_audit_logs_entity_type_entity_id_idx" ON "rms_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "rms_audit_logs_changed_by_idx" ON "rms_audit_logs"("changed_by");

-- CreateIndex
CREATE INDEX "rms_audit_logs_created_at_idx" ON "rms_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "rms_webhook_logs_source_status_idx" ON "rms_webhook_logs"("source", "status");

-- AddForeignKey
ALTER TABLE "rms_roles" ADD CONSTRAINT "rms_roles_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "rms_functions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employees" ADD CONSTRAINT "rms_employees_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "rms_functions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employees" ADD CONSTRAINT "rms_employees_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "rms_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employees" ADD CONSTRAINT "rms_employees_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "rms_pods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employee_platforms" ADD CONSTRAINT "rms_employee_platforms_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "rms_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employee_platforms" ADD CONSTRAINT "rms_employee_platforms_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "rms_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employee_skills" ADD CONSTRAINT "rms_employee_skills_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "rms_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employee_skills" ADD CONSTRAINT "rms_employee_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "rms_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_pods" ADD CONSTRAINT "rms_pods_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "rms_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_projects" ADD CONSTRAINT "rms_projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "rms_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_projects" ADD CONSTRAINT "rms_projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "rms_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_projects" ADD CONSTRAINT "rms_projects_growth_consultant_id_fkey" FOREIGN KEY ("growth_consultant_id") REFERENCES "rms_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_projects" ADD CONSTRAINT "rms_projects_practice_poc_id_fkey" FOREIGN KEY ("practice_poc_id") REFERENCES "rms_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_project_technologies" ADD CONSTRAINT "rms_project_technologies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "rms_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_project_technologies" ADD CONSTRAINT "rms_project_technologies_technology_id_fkey" FOREIGN KEY ("technology_id") REFERENCES "rms_technologies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_allocations" ADD CONSTRAINT "rms_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "rms_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_allocations" ADD CONSTRAINT "rms_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "rms_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_allocations" ADD CONSTRAINT "rms_allocations_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "rms_sprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_employee_compute_costs" ADD CONSTRAINT "rms_employee_compute_costs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "rms_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_project_compute_costs" ADD CONSTRAINT "rms_project_compute_costs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "rms_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_pnl_snapshots" ADD CONSTRAINT "rms_pnl_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "rms_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rms_pnl_snapshots" ADD CONSTRAINT "rms_pnl_snapshots_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "rms_sprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
