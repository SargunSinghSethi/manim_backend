-- AlterTable
ALTER TABLE "public"."jobs" ADD COLUMN     "retryLeft" INTEGER NOT NULL DEFAULT 3;
