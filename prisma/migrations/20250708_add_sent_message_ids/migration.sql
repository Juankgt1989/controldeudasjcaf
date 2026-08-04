-- AlterTable
ALTER TABLE "InstallmentNotification" ADD COLUMN "sentMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
