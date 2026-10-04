import { describe, expect, it } from "vitest";
import { readExpensePdf } from "@/lib/expenses/model";
import { readClaimReceipt } from "@/lib/claims/receipt";

/**
 * ファイルを選ばずに送信すると、ブラウザは空のファイルを送り、サーバーに届いたときの名前は "blob" になる
 * （画面で確認した挙動）。これを「ファイルなし」として扱わないと、添付なしの支払いや、レシートを変えない
 * 申請の保存が「ファイルが空です」で失敗する。
 */
describe("a form submitted without choosing a file", () => {
  const empty = [new File([], ""), new File([], "blob")];
  it("is not an attached PDF", async () => {
    for (const f of empty) expect(await readExpensePdf(f)).toBeNull();
    expect(await readExpensePdf(null)).toBeNull();
  });
  it("is not a claim receipt", async () => {
    for (const f of empty) expect(await readClaimReceipt(f)).toBeNull();
  });
  it("still rejects a really empty, named file", async () => {
    await expect(readExpensePdf(new File([], "請求書.pdf"))).rejects.toThrow(
      "空です",
    );
    await expect(
      readClaimReceipt(new File([], "レシート.png")),
    ).rejects.toThrow("空でない");
  });
});
