import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(params: {
  password: string;
  passwordHash: string;
}): Promise<boolean> {
  return bcrypt.compare(params.password, params.passwordHash);
}

