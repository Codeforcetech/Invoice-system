import { describe, expect, it } from "vitest";
import { dispositionName, downloadName } from "@/lib/evidence/download-name";
import {
  EXPENSE_CATEGORIES,
  RECEIPT_CATEGORIES,
  REWARD_CATEGORY,
} from "@/lib/expenses/model";

describe("領収書のファイル名", () => {
  it("誰から・いつ・何のが名前で分かる", () => {
    expect(
      downloadName(["山田 太郎", "2026-09-12", "サンプル食堂"], "webp"),
    ).toBe("山田 太郎_2026-09-12_サンプル食堂.webp");
  });
  it("使えない文字を取り除き、空の項目は飛ばす", () => {
    expect(downloadName(["a/b:c*d", null, "x\ny"], "pdf")).toBe(
      "a b c d_x y.pdf",
    );
  });
  it("長すぎる名前を切り、何もなければ「領収書」にする", () => {
    expect(downloadName(["あ".repeat(100)], "pdf").length).toBeLessThanOrEqual(
      44,
    );
    expect(downloadName([null, ""], "pdf")).toBe("領収書.pdf");
  });
  it("ヘッダーに入れても壊れない形にする", () => {
    const h = dispositionName(downloadName(['山田"太郎', "9月"], "pdf"));
    expect(h).toMatch(/^filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
    expect(h).not.toMatch(/\n/);
    expect(decodeURIComponent(h.split("UTF-8''")[1])).toBe("山田 太郎_9月.pdf");
  });
});

describe("費目", () => {
  it("支払管理には「業務委託報酬」があり、経費精算・領収書の読み取りには出さない", () => {
    expect(EXPENSE_CATEGORIES).toContain(REWARD_CATEGORY);
    expect(RECEIPT_CATEGORIES as readonly string[]).not.toContain(
      REWARD_CATEGORY,
    );
  });
});
