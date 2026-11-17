import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { getEnv } from "../env";

const globalForPrisma = globalThis as typeof globalThis & { __optimaPrisma?: PrismaClient };

/**
 * Client Prisma unique, connecté avec le rôle applicatif `optima_app`
 * (sans BYPASSRLS). En développement, il survit au rechargement à chaud.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__optimaPrisma) {
    globalForPrisma.__optimaPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
    });
  }
  return globalForPrisma.__optimaPrisma;
}
