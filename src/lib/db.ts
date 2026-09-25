import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { napraviPrismu } from "./prisma";

// Jedan klijent po procesu; u razvoju preživi ponovno učitavanje modula.
const globalno = globalThis as unknown as { erpDb?: PrismaClient };

export const db: PrismaClient = globalno.erpDb ?? napraviPrismu();

if (process.env.NODE_ENV !== "production") globalno.erpDb = db;
