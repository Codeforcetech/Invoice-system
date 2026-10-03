import { it, expect } from "vitest";
import sharp from "sharp";
import { readClaimReceipt } from "@/lib/claims/receipt";
import { claimSchema } from "@/lib/claims/model";
it("sanitizes supported images into WebP and strips metadata", async () => {
  const image = await sharp({
    create: { width: 30, height: 10, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  const r = await readClaimReceipt(
    new File([new Uint8Array(image)], "test.jpg", { type: "image/jpeg" }),
  );
  expect(r?.mimeType).toBe("image/webp");
  expect((await sharp(r!.data).metadata()).exif).toBeUndefined();
});
it("rejects oversized, empty, SVG, spoofed image and spoofed PDF", async () => {
  for (const f of [
    new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.png"),
    new File([], "empty.png"),
    new File(["<svg/>"], "logo.svg"),
    new File(["not-png"], "fake.png"),
    new File(["<html/>"], "fake.pdf", { type: "application/pdf" }),
  ])
    await expect(readClaimReceipt(f)).rejects.toThrow();
});
it("validates integer money and actual past dates", () => {
  const base = {
    id: crypto.randomUUID(),
    ownerId: "owner",
    title: "expense",
    merchant: "shop",
    date: "2026-09-01",
    amount: 100,
    category: "交通費",
    note: "",
  };
  expect(claimSchema.safeParse(base).success).toBe(true);
  for (const change of [
    { amount: 0 },
    { amount: 1.5 },
    { amount: 2147483648 },
    { date: "2026-02-30" },
    { date: "2099-01-01" },
  ])
    expect(claimSchema.safeParse({ ...base, ...change }).success).toBe(false);
});
