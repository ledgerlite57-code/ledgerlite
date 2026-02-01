const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

prisma.user
  .findMany({
    where: { email: "owner@ledgerlite.local" },
    select: { id: true, email: true, isActive: true, isInternal: true, passwordHash: true },
  })
  .then((rows) => {
    console.log(rows);
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => prisma["$disconnect"]());
