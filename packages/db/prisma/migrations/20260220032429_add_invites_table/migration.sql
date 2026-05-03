-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "rms_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "system_role" "SystemRole" NOT NULL DEFAULT 'EMPLOYEE',
    "invited_by" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rms_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rms_invites_status_idx" ON "rms_invites"("status");

-- CreateIndex
CREATE INDEX "rms_invites_invited_by_idx" ON "rms_invites"("invited_by");

-- CreateIndex
CREATE UNIQUE INDEX "rms_invites_email_status_key" ON "rms_invites"("email", "status");
