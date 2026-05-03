import { PrismaClient } from '../generated/client';

// Allow BigInt to be serialized to JSON (Prisma returns BigInt for bigint columns)
// Safe for our use case: all cent values fit within Number.MAX_SAFE_INTEGER (9 quadrillion)
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '../generated/client';
