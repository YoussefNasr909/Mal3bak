import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const isProd = process.env.NODE_ENV === "production";

const prismaClient = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: isProd
    ? [
        { level: "warn", emit: "stdout" },
        { level: "error", emit: "stdout" },
      ]
    : [],
});

export const prisma = prismaClient;
export default prisma;
