-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'REJECTED', 'GHOSTED');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "jobUrl" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "fitScore" INTEGER,
    "fitNotes" TEXT,
    "coverLetter" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);
