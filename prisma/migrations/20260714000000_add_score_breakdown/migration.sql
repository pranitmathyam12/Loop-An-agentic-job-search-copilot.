-- Add Claude scoring breakdown columns to Application.
-- All nullable so existing rows (scored by the earlier single-explanation
-- scorer, which populated fitNotes) remain valid.

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "skillsMatch" INTEGER,
ADD COLUMN     "experienceMatch" INTEGER,
ADD COLUMN     "domainMatch" INTEGER,
ADD COLUMN     "strengths" TEXT,
ADD COLUMN     "gaps" TEXT;
