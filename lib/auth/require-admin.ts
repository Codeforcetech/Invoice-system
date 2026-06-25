import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

