import { z } from "zod";

export const adminCreateUserSchema = z.object({
  name: z.string().min(1, "氏名は必須です"),
  email: z.string().email("メールアドレス形式で入力してください"),
  password: z
    .string()
    .min(12, "パスワードは12文字以上にしてください")
    // bcrypt only uses the first 72 bytes; refuse longer values instead of silently truncating them.
    .refine(
      (v) => new TextEncoder().encode(v).length <= 72,
      "パスワードは72バイト（半角72文字）以内にしてください",
    ),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
