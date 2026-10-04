/**
 * 使い方ガイドの画面写真を撮るための、きれいな見本データを作る（通常のテストでは実行しない）。
 *
 *   GUIDE_SEED=1 DATABASE_URL=<見本用のデータベース> npx vitest run tests/guide-seed.test.ts
 *
 * 見本用のデータベースは、開発用とは別に作ること（このテストは、先頭でその中身を消す）。
 * 実在の会社・人の情報は使わない（すべて架空）。
 */
import { describe, it, vi } from "vitest";
import { writeFileSync } from "node:fs";

const auth = vi.hoisted(() => ({ id: "guide-admin" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
}));
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  recordEasyTransaction,
  saveOpeningBalances,
} from "@/actions/easy-accounting-actions";
import { createInvoice } from "@/actions/invoice-actions";
import { recordInvoiceReceipt } from "@/actions/invoice-receipt-actions";
import { saveExpense } from "@/actions/expense-actions";
import {
  processClaim,
  saveClaim,
  saveClaimMember,
  setupClaimWorkspace,
} from "@/actions/claim-actions";
import {
  approveSubmission,
  rejectSubmission,
  saveSubmission,
  saveSubmitterProfile,
  submitSubmission,
} from "@/actions/submission-actions";
import { createSubmissionLink } from "@/actions/submission-link-actions";
import { submitViaLink } from "@/actions/public-submission-actions";
import { createStatementFeed } from "@/actions/statement-actions";
import { monthRange } from "@/lib/accounting/received";

const as = (id: string) => {
  auth.id = id;
};
const must = async <T extends { ok?: boolean; error?: string }>(
  label: string,
  p: Promise<T>,
) => {
  const r = await p;
  if (r && r.ok === false) throw new Error(`${label}: ${r.error}`);
  return r;
};

/** 架空のレシート画像（見本用）。 */
async function fakeReceipt(shop: string, amount: number, date: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520"><rect width="360" height="520" fill="#fff"/>
  <text x="180" y="60" font-size="26" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-weight="700">${shop}</text>
  <text x="180" y="95" font-size="14" text-anchor="middle" font-family="Hiragino Sans, sans-serif" fill="#555">領 収 書</text>
  <line x1="30" y1="120" x2="330" y2="120" stroke="#999"/>
  <text x="30" y="160" font-size="16" font-family="Hiragino Sans, sans-serif">${date}</text>
  <text x="30" y="220" font-size="16" font-family="Hiragino Sans, sans-serif">ご利用料金</text>
  <text x="330" y="220" font-size="20" text-anchor="end" font-family="Hiragino Sans, sans-serif">¥${amount.toLocaleString("ja-JP")}</text>
  <line x1="30" y1="250" x2="330" y2="250" stroke="#999"/>
  <text x="30" y="290" font-size="16" font-family="Hiragino Sans, sans-serif" font-weight="700">合計（税込）</text>
  <text x="330" y="290" font-size="22" text-anchor="end" font-family="Hiragino Sans, sans-serif" font-weight="700">¥${amount.toLocaleString("ja-JP")}</text>
  <text x="180" y="470" font-size="12" text-anchor="middle" font-family="Hiragino Sans, sans-serif" fill="#888">ありがとうございました</text></svg>`;
  const data = await sharp(Buffer.from(svg)).png().toBuffer();
  return new File([data as Uint8Array<ArrayBuffer>], `receipt-${shop}.png`, {
    type: "image/png",
  });
}
const pdf = (t: string) =>
  new File(
    [
      new TextEncoder().encode(
        `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
      ) as Uint8Array<ArrayBuffer>,
    ],
    `${t}.pdf`,
    { type: "application/pdf" },
  );

describe.skipIf(process.env.GUIDE_SEED !== "1")("guide demo data", () => {
  it("creates a clean, fictional demo workspace", async () => {
    // --- 先に、見本用のデータベースを空にする ---
    await prisma.$executeRawUnsafe(`DO $$ DECLARE r record; BEGIN
      PERFORM set_config('session_replication_role','replica',true);
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE'; END LOOP; END $$;`);

    const ids: Record<string, string> = {};
    const people: [string, string, string][] = [
      ["guide-admin", "管理 太郎", "admin@example.com"],
      ["guide-approver", "承認 花子", "approver@example.com"],
      ["guide-editor", "入力 次郎", "editor@example.com"],
      ["guide-contractor", "山田 太郎", "contractor@example.com"],
      ["guide-applicant", "申請 三郎", "applicant@example.com"],
      // まだ何も設定していない、新しい管理者（「最初の設定」の画面を撮るため）
      ["guide-admin2", "新規 花子", "new-admin@example.com"],
    ];
    for (const [id, name, email] of people)
      await prisma.user.create({
        data: {
          id,
          name,
          email,
          passwordHash: "no-login",
          role: id.startsWith("guide-admin") ? "ADMIN" : "USER",
        },
      });
    for (const [userId, role] of [
      ["guide-approver", "APPROVER"],
      ["guide-editor", "EDITOR"],
      ["guide-contractor", "SUBMITTER"],
      ["guide-applicant", "SUBMITTER"],
    ])
      await prisma.workspaceMember.create({
        data: { ownerId: "guide-admin", userId, role },
      });

    // --- 自社情報 ---
    await prisma.systemSetting.create({
      data: {
        userId: "guide-admin",
        companyName: "株式会社サンプルデザイン",
        invoiceRegistrationNumber: "T1234567890123",
        postalCode: "100-0001",
        address: "東京都千代田区サンプル1-2-3",
        phone: "03-0000-0000",
        email: "info@example.com",
        contactPerson: "管理 太郎",
        bankName: "サンプル銀行",
        branchName: "本店",
        accountType: "普通",
        accountNumber: "1234567",
        accountHolder: "カ）サンプルデザイン",
        accountHolderKana: "カ）サンプルデザイン",
        transferNote: "振込手数料は、お客様のご負担でお願いします。",
        taxRate: 1000,
      },
    });
    for (const [id, name, code, email] of [
      ["guide-co-1", "株式会社みらい商事", "MIRAI", "keiri@example.com"],
      ["guide-co-2", "有限会社あおぞら工房", "AOZORA", "info@example.com"],
      ["guide-co-3", "北山製作所", "KITAYAMA", "contact@example.com"],
    ])
      await prisma.company.create({
        data: {
          id,
          userId: "guide-admin",
          name,
          invoiceCode: code,
          billingEmail: email,
          defaultDueDays: 30,
        },
      });

    // --- 会計 ---
    as("guide-admin");
    await initializeAccounting({
      startDate: "2026-04-01",
      industry: "SERVICE",
    });
    await must(
      "opening",
      saveOpeningBalances({
        cash: 50000,
        bank: 2400000,
        receivable: 0,
        payable: 0,
        loan: 0,
      }),
    );
    const acc = async (code: string) =>
      (
        await prisma.account.findUniqueOrThrow({
          where: { userId_code: { userId: "guide-admin", code } },
        })
      ).id;
    const bank = await acc("110"),
      cash = await acc("100");

    // --- 請求書 ---
    const item = (name: string, price: number) => ({
      productName: name,
      quantity: 1,
      unitPrice: price,
      amount: price,
      amountManuallyEdited: false,
    });
    const inv = (
      companyId: string,
      subject: string,
      issue: string,
      due: string,
      status: string,
      items: ReturnType<typeof item>[],
    ) =>
      createInvoice({
        companyId,
        subject,
        issueDate: new Date(issue),
        dueDate: new Date(due),
        status,
        withholdingEnabled: false,
        items,
      });
    const i1 = (await inv(
      "guide-co-1",
      "9月分 Webサイト制作費",
      "2026-09-01",
      "2026-09-30",
      "ISSUED",
      [
        item("Webサイト制作（トップページ）", 200000),
        item("保守・運用サポート", 30000),
      ],
    )) as { id: string };
    const i2 = (await inv(
      "guide-co-2",
      "10月分 ロゴデザイン",
      "2026-10-01",
      "2026-10-31",
      "ISSUED",
      [item("ロゴデザイン制作", 120000)],
    )) as { id: string };
    const i3 = (await inv(
      "guide-co-3",
      "パンフレット制作（見積前）",
      "2026-10-05",
      "2026-11-05",
      "DRAFT",
      [item("パンフレット デザイン", 80000)],
    )) as { id: string };
    ids.invoicePaid = i1.id;
    ids.invoiceIssued = i2.id;
    ids.invoiceDraft = i3.id;
    const got = await prisma.invoice.findUniqueOrThrow({
      where: { id: i1.id },
    });
    await must(
      "receipt",
      recordInvoiceReceipt({
        invoiceId: i1.id,
        version: got.updatedAt.toISOString(),
        receivedDate: "2026-10-02",
      }),
    );

    // --- 支払い（受け取った請求書） ---
    const exp = (
      id: string,
      supplier: string,
      description: string,
      category: string,
      amount: number,
      costMonth: string,
      dueDate: string,
      paidDate = "",
    ) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({
        id,
        supplier,
        description,
        category,
        amount: String(amount),
        costMonth,
        dueDate,
        paidDate,
        note: "",
      }))
        f.set(k, v);
      return saveExpense(f);
    };
    await must(
      "exp1",
      exp(
        crypto.randomUUID(),
        "クラウドサービス株式会社",
        "9月分 サーバー利用料",
        "通信・サブスク",
        11000,
        "2026-09",
        "2026-09-30",
        "2026-09-28",
      ),
    );
    const e2 = crypto.randomUUID();
    await must(
      "exp2",
      exp(
        e2,
        "デザイン素材ストア",
        "10月分 素材ライセンス",
        "備品・消耗品",
        5500,
        "2026-10",
        "2026-10-31",
      ),
    );
    ids.expenseUnpaid = e2;
    await must(
      "exp3",
      exp(
        crypto.randomUUID(),
        "佐藤 次郎",
        "9月分 開発業務委託",
        "業務委託報酬",
        165000,
        "2026-09",
        "2026-10-31",
      ),
    );

    // --- お金の出入り（かんたん入力） ---
    const easy = (
      kind: string,
      date: string,
      amount: number,
      memo: string,
      categoryAccountId: string,
      moneyAccountId: string,
      taxChoice = "10",
    ) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({
        requestKey: crypto.randomUUID(),
        kind,
        date,
        amount: String(amount),
        categoryAccountId,
        moneyAccountId,
        toAccountId: "",
        memo,
        taxChoice,
      }))
        f.set(k, v);
      return recordEasyTransaction(f);
    };
    await must(
      "easy1",
      easy(
        "OUT",
        "2026-10-01",
        3300,
        "NTT 電話代 9月分",
        await acc("530"),
        bank,
      ),
    );
    await must(
      "easy2",
      easy(
        "OUT",
        "2026-10-03",
        1200,
        "文房具（コンビニ）",
        await acc("560"),
        cash,
      ),
    );
    const mv = new FormData();
    for (const [k, v] of Object.entries({
      requestKey: crypto.randomUUID(),
      kind: "MOVE",
      date: "2026-10-04",
      amount: "30000",
      categoryAccountId: "",
      moneyAccountId: bank,
      toAccountId: cash,
      memo: "",
      taxChoice: "none",
    }))
      mv.set(k, v);
    await must("move", recordEasyTransaction(mv));
    await must(
      "feed",
      createStatementFeed({
        name: "サンプル銀行（法人口座）",
        kind: "BANK",
        accountId: bank,
      }),
    );

    // --- 経費精算（申請者） ---
    await must(
      "claim ws",
      setupClaimWorkspace({ name: "株式会社サンプルデザイン 経費精算" }),
    );
    as("guide-admin");
    await must(
      "claim member 1",
      saveClaimMember({
        email: "applicant@example.com",
        role: "SUBMITTER",
        active: true,
      }),
    );
    await must(
      "claim member 2",
      saveClaimMember({
        email: "approver@example.com",
        role: "APPROVER",
        active: true,
      }),
    );
    as("guide-applicant");
    const claim = async (
      title: string,
      merchant: string,
      date: string,
      amount: number,
      category: string,
      submit: boolean,
    ) => {
      const id = crypto.randomUUID();
      const f = new FormData();
      for (const [k, v] of Object.entries({
        id,
        ownerId: "guide-admin",
        title,
        merchant,
        date,
        amount: String(amount),
        category,
        note: "",
      }))
        f.set(k, v);
      f.set(
        "receipt",
        await fakeReceipt(merchant, amount, date.replace(/-/g, "/")),
      );
      await must("claim save", saveClaim(f));
      if (submit) {
        const row = await prisma.expenseClaim.findUniqueOrThrow({
          where: { id },
        });
        await must(
          "claim submit",
          processClaim({
            id,
            version: row.updatedAt.toISOString(),
            action: "SUBMIT",
          }),
        );
      }
      return id;
    };
    ids.claimPending = await claim(
      "お客様訪問の交通費",
      "サンプル鉄道",
      "2026-10-02",
      1480,
      "交通費",
      true,
    );
    ids.claimDraft = await claim(
      "打ち合わせ用の資料印刷",
      "プリントショップ サンプル",
      "2026-10-04",
      880,
      "備品・消耗品",
      false,
    );
    ids.claimRejected = await claim(
      "取引先との会食",
      "レストラン サンプル",
      "2026-10-03",
      6600,
      "その他",
      true,
    );
    as("guide-approver");
    const rj = await prisma.expenseClaim.findUniqueOrThrow({
      where: { id: ids.claimRejected },
    });
    await must(
      "claim reject",
      processClaim({
        id: ids.claimRejected,
        version: rj.updatedAt.toISOString(),
        action: "REJECT",
        comment: "会食の相手と目的を、補足に書き足してください。",
      }),
    );
    as("guide-applicant");

    // --- 業務委託（提出者） ---
    as("guide-contractor");
    await must(
      "profile",
      saveSubmitterProfile({
        legalName: "山田 太郎",
        address: "東京都港区サンプル4-5-6",
        registrationNumber: "T1234567890123",
        bankName: "サンプル銀行",
        branchName: "渋谷支店",
        accountType: "普通",
        accountNumber: "7654321",
        accountHolder: "ヤマダ タロウ",
      }),
    );
    const sub = async (
      month: string,
      title: string,
      items: unknown[],
      withFile: boolean,
      submit: boolean,
    ) => {
      const id = crypto.randomUUID();
      const f = new FormData();
      f.set(
        "payload",
        JSON.stringify({
          id,
          month,
          title,
          note: "いつもありがとうございます。",
          items,
        }),
      );
      if (withFile)
        f.append(
          "files",
          await fakeReceipt("サンプル鉄道", 3000, "2026/09/20"),
        );
      await must("sub save", saveSubmission(f));
      if (submit) {
        const row = await prisma.submission.findUniqueOrThrow({
          where: { id },
        });
        await must(
          "sub submit",
          submitSubmission({ id, version: row.updatedAt.toISOString() }),
        );
      }
      return id;
    };
    const reward = (name: string, price: number) => ({
      kind: "REWARD",
      name,
      quantity: 1,
      unitPrice: price,
      taxCategory: "TAXABLE_10",
      note: "",
    });
    const fare = (name: string, price: number) => ({
      kind: "TRANSPORT",
      name,
      quantity: 1,
      unitPrice: price,
      taxCategory: "EXEMPT",
      note: "",
    });
    const doneId = await sub(
      "2026-09",
      "9月分の業務委託料",
      [
        reward("Webサイト制作（9月分）", 150000),
        fare("客先訪問の電車代", 3000),
      ],
      true,
      true,
    );
    ids.submissionPending = await sub(
      "2026-10",
      "10月分の業務委託料",
      [
        reward("バナーデザイン制作（10月分）", 80000),
        fare("打ち合わせの電車代", 1200),
      ],
      true,
      true,
    );
    ids.submissionDraft = await sub(
      "2026-10",
      "10月分（追加）",
      [reward("チラシ制作", 40000)],
      false,
      false,
    );
    ids.submissionRejected = await sub(
      "2026-09",
      "9月分の業務委託料（追加分）",
      [reward("チラシ制作（9月分）", 30000), fare("打ち合わせの電車代", 800)],
      true,
      true,
    );
    as("guide-approver");
    const rejRow = await prisma.submission.findUniqueOrThrow({
      where: { id: ids.submissionRejected },
    });
    await must(
      "reject",
      rejectSubmission({
        id: ids.submissionRejected,
        version: rejRow.updatedAt.toISOString(),
        reason: "電車代の領収書を、日付の分かるものに差し替えてください。",
      }),
    );
    const doneRow = await prisma.submission.findUniqueOrThrow({
      where: { id: doneId },
    });
    await must(
      "approve",
      approveSubmission({
        id: doneId,
        version: doneRow.updatedAt.toISOString(),
      }),
    );
    ids.submissionApproved = doneId;

    // --- 外部の提出リンク ---
    const link = (await must(
      "link",
      createSubmissionLink({ label: "田中 花子さん", days: 30, aiReads: 5 }),
    )) as unknown as { id: string; token: string };
    ids.linkToken = link.token;
    // 初めて使う人の画面（前回の入力が残っていないもの）を撮るための、まっさらなリンク
    const fresh = (await must(
      "link2",
      createSubmissionLink({ label: "高橋 美咲さん", days: 30, aiReads: 5 }),
    )) as unknown as { id: string; token: string };
    ids.linkTokenFresh = fresh.token;
    ids.linkId = link.id;
    const ext = new FormData();
    ext.set("token", link.token);
    ext.set(
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        month: "2026-10",
        title: "10月分のデザイン制作",
        note: "",
        items: [reward("バナーデザイン制作", 60000)],
        profile: {
          legalName: "田中 花子",
          address: "東京都新宿区サンプル7-8-9",
          phone: "",
          registrationNumber: "",
          bankName: "サンプル銀行",
          branchName: "新宿支店",
          accountType: "普通",
          accountNumber: "1112223",
          accountHolder: "タナカ ハナコ",
        },
        contactEmail: "",
      }),
    );
    await must("external submit", submitViaLink(ext));
    ids.externalSubmission = (
      await prisma.submission.findFirstOrThrow({ where: { linkId: link.id } })
    ).id;
    void pdf;
    void monthRange;

    writeFileSync(
      process.env.GUIDE_IDS_OUT ?? "/tmp/guide-ids.json",
      JSON.stringify(ids, null, 2),
    );
  }, 180_000);
});
