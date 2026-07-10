-- Enforce fitScore in the 0–100 range at the database level.
-- Prisma does not generate CHECK constraints from schema.prisma, so we add it manually.
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_fitScore_range" CHECK ("fitScore" BETWEEN 0 AND 100);
