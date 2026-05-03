-- Add show_in_allocations flag to employees
-- Allows hiding individual employees from the Allocation Gantt view
ALTER TABLE "employees" ADD COLUMN "show_in_allocations" BOOLEAN NOT NULL DEFAULT true;
