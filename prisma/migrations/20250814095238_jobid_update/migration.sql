-- AlterTable
ALTER TABLE "public"."jobs" ADD COLUMN     "videoId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "public"."videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
