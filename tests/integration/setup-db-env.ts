import { TEST_DATABASE_URL } from "./test-db-url";

// Must run before any module creates the Prisma client.
process.env.DATABASE_URL = TEST_DATABASE_URL;
