import { Prisma } from "@prisma/client";

/** 請求書番号の一意制約違反（採番のずれ・競合など） */
export function isUniqueOnInvoiceNumber(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes("invoiceNumber");
  if (typeof target === "string") return target.includes("invoiceNumber");
  return false;
}
