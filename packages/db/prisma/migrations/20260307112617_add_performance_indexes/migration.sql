-- CreateIndex
CREATE INDEX "rms_allocations_project_id_sprint_id_deleted_at_idx" ON "rms_allocations"("project_id", "sprint_id", "deleted_at");

-- CreateIndex
CREATE INDEX "rms_allocations_employee_id_sprint_id_deleted_at_idx" ON "rms_allocations"("employee_id", "sprint_id", "deleted_at");

-- CreateIndex
CREATE INDEX "rms_allocations_sprint_id_deleted_at_idx" ON "rms_allocations"("sprint_id", "deleted_at");

-- CreateIndex
CREATE INDEX "rms_projects_status_deleted_at_idx" ON "rms_projects"("status", "deleted_at");
