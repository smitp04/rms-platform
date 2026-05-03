-- Rename shared platform tables (drop rms_ prefix)
-- These tables are used by all tools (RMS, EMS, CSAT, CRM) not just RMS.

ALTER TABLE "rms_functions" RENAME TO "functions";
ALTER TABLE "rms_roles" RENAME TO "roles";
ALTER TABLE "rms_skills" RENAME TO "skills";
ALTER TABLE "rms_platforms" RENAME TO "platforms";
ALTER TABLE "rms_employees" RENAME TO "employees";
ALTER TABLE "rms_employee_platforms" RENAME TO "employee_platforms";
ALTER TABLE "rms_employee_skills" RENAME TO "employee_skills";
ALTER TABLE "rms_pods" RENAME TO "pods";
ALTER TABLE "rms_accounts" RENAME TO "accounts";
ALTER TABLE "rms_audit_logs" RENAME TO "audit_logs";
ALTER TABLE "rms_webhook_logs" RENAME TO "webhook_logs";

-- Rename indexes that reference the old table names
-- PostgreSQL renames constraints/indexes automatically when table is renamed,
-- but sequence names embedded in default values may need updating.
-- The table FKs are already pointing to the right tables after RENAME.
