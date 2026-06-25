import { z } from "zod";

export const adminCreateUserSchema = z.object({
  name: z.string().min(1, "氏名は必須です"),
  email: z.string().email("メールアドレス形式で入力してください"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

