import { PrismaClient } from "@prisma/client";

// A single shared PrismaClient. In dev, Next.js hot-reload re-imports modules
// repeatedly; stash the client on globalThis so we don't open a new connection
// pool on every reload. In production a fresh module instance is fine.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
