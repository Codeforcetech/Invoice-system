"use server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { accountingLock, postJournal } from "@/lib/accounting/service";
import { dateText } from "@/lib/accounting/model";
import {
  NEW_OTHER_INCOME_ID,
  OPENING_MEMO,
  OTHER_INCOME,
  buildEasyLines,
  describeEasy,
  easyKindInfo,
  easySchema,
  loadMoneyOptions,
  openingLines,
  openingSchema,
} from "@/lib/accounting/easy";
import { hasOpeningBalance } from "@/lib/accounting/opening";
import { counterpartyKey } from "@/lib/evidence/model";
import { readEvidenceFile } from "@/lib/evidence/file";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError } from "@/lib/workspace/access";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof z.ZodError)
    return {
      ok: false,
      error: e.issues[0]?.message ?? "入力内容を確認してください。",
    };
  if (e instanceof PermissionError) return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return {
      ok: false,
      error: "同じ領収書のファイルが、すでに保存されています。",
    };
  if (e instanceof Error && !e.message.includes("\n") && !("code" in e))
    return { ok: false, error: e.message };
  return {
    ok: false,
    error: "記録できませんでした。入力内容を確認して、もう一度お試しください。",
  };
}
const refresh = () => {
  revalidatePath("/accounting", "layout");
  revalidatePath("/dashboard");
};

/**
 * お金の出入りを、やさしい入力（種類・金額・何のお金か・口座）から記録する。
 * 借方・貸方の仕訳はここで自動で作る。領収書を添付すると、証憑ファイルボックスにも保存する。
 */
export async function recordEasyTransaction(
  form: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const ws = await requireWorkspace("EDITOR");
    const { file, ...rest } = Object.fromEntries(form);
    const v = easySchema.parse(rest);
    // 内容の確認は、記録の前に済ませる（形式の合わないファイルで、記録だけ残らないようにする）。
    const attachment =
      v.kind !== "MOVE" && file instanceof File && (file.size > 0 || file.name)
        ? await readEvidenceFile(file)
        : null;

    const id = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      // 同じ操作の再送は、二重に記録しない。
      const same = await tx.journalEntry.findUnique({
        where: {
          userId_requestKey: { userId: ws.ownerId, requestKey: v.requestKey },
        },
        select: { id: true },
      });
      if (same) return same.id;
      if (
        !(await tx.accountingSetting.findUnique({
          where: { userId: ws.ownerId },
        }))
      )
        throw new Error("先に「会計をはじめる」で、会計の設定をしてください。");

      const { accounts, options } = await loadMoneyOptions(tx, ws.ownerId);
      const name = (accountId: string) =>
        accounts.find((a) => a.id === accountId)?.name ?? "";
      const moneyIds = new Set(options.money.map((m) => m.id));
      const moneyOf = (accountId: string) =>
        options.money.find((m) => m.id === accountId);
      if (!moneyIds.has(v.moneyAccountId))
        throw new Error("選んだ口座は使えません。選びなおしてください。");

      let categoryId: string | undefined;
      if (v.kind === "MOVE") {
        if (!moneyIds.has(v.toAccountId))
          throw new Error("選んだ移動先は使えません。選びなおしてください。");
      } else {
        categoryId = v.categoryAccountId;
        if (categoryId === NEW_OTHER_INCOME_ID) {
          if (v.kind !== "IN")
            throw new Error("この分類は、入ってきたお金にだけ使えます。");
          const existing = await tx.account.findUnique({
            where: {
              userId_code: { userId: ws.ownerId, code: OTHER_INCOME.code },
            },
          });
          if (existing && existing.kind !== "REVENUE")
            throw new Error(
              `科目コード${OTHER_INCOME.code}がほかの用途で使われています。勘定科目の画面で確認してください。`,
            );
          categoryId = (
            existing ??
            (await tx.account.create({
              data: {
                userId: ws.ownerId,
                code: OTHER_INCOME.code,
                name: OTHER_INCOME.name,
                kind: "REVENUE",
                system: true,
              },
            }))
          ).id;
        }
        const list = v.kind === "OUT" ? options.out : options.income;
        if (!list.some((o) => o.id === v.categoryAccountId))
          throw new Error("選んだ分類は使えません。選びなおしてください。");
      }

      const memo =
        v.memo ||
        `${moneyOf(v.moneyAccountId)?.label ?? "口座"}から${moneyOf(v.toAccountId)?.label ?? "口座"}へ移動`;
      const entry = await postJournal(
        tx,
        ws.ownerId,
        {
          requestKey: v.requestKey,
          date: v.date,
          memo,
          lines: buildEasyLines(v, {
            category: categoryId,
            money: v.moneyAccountId,
            to: v.toAccountId,
          }),
        },
        "MANUAL",
      );

      if (attachment) {
        const row = await tx.evidenceFile.create({
          data: {
            ownerId: ws.ownerId,
            uploadedById: ws.userId,
            kind: v.kind === "OUT" ? "RECEIPT" : "OTHER",
            transactionDate: new Date(v.date),
            amount: v.amount,
            counterparty: memo,
            counterpartyKey: counterpartyKey(memo),
            memo: "お金の出入りを記録したときに添付",
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            sha256: attachment.sha256,
            data: attachment.data,
          },
          select: { id: true },
        });
        await tx.evidenceHistory.create({
          data: {
            evidenceId: row.id,
            ownerId: ws.ownerId,
            actorId: ws.userId,
            action: "UPLOAD",
            after: {
              kind: v.kind === "OUT" ? "RECEIPT" : "OTHER",
              transactionDate: v.date,
              amount: v.amount,
              counterparty: memo,
              source: "お金の記録に添付",
            },
          },
        });
        await recordAudit(tx, ws, {
          action: "EVIDENCE_UPLOAD",
          entity: "EVIDENCE",
          entityId: row.id,
          summary: `お金の記録に添付された領収書を、証憑として保存（${v.date}・${memo.slice(0, 60)}）`,
        });
      }

      await recordAudit(tx, ws, {
        action: "JOURNAL_POST",
        entity: "JOURNAL",
        entityId: entry.id,
        summary: `お金の記録（${easyKindInfo[v.kind].summary}）${v.date}：${describeEasy(
          v,
          {
            category: categoryId ? name(categoryId) : undefined,
            money: name(v.moneyAccountId),
            to: name(v.toAccountId),
          },
        ).slice(0, 200)}`,
      });
      return entry.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}

/**
 * 開始残高を登録する。「いま、現金・預金はいくらか」などに答えるだけでよい。
 * 差額は「元入金・資本金」として、貸借が合うように自動で計算する。登録は1回だけ。
 */
export async function saveOpeningBalances(
  raw: unknown,
): Promise<Result<{ equity: number }>> {
  try {
    const ws = await requireWorkspace("ADMIN");
    const v = openingSchema.parse(raw);
    const equity = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const setting = await tx.accountingSetting.findUnique({
        where: { userId: ws.ownerId },
      });
      if (!setting)
        throw new Error("先に「会計をはじめる」で、会計の設定をしてください。");
      if (await hasOpeningBalance(tx, ws.ownerId))
        throw new Error(
          "開始残高は、すでに入力済みです。直したいときは、経理の方に相談するか、仕訳帳で取り消してください。",
        );
      const accounts = await tx.account.findMany({
        where: {
          userId: ws.ownerId,
          code: { in: ["100", "110", "120", "210", "220", "300"] },
        },
      });
      const idOf = (code: string) => {
        const a = accounts.find((x) => x.code === code);
        if (!a)
          throw new Error(
            "開始残高に使う科目が見つかりません。勘定科目の画面で確認してください。",
          );
        return a.id;
      };
      const built = openingLines(v, idOf);
      if (built.lines.length < 2)
        throw new Error(
          "金額が入力されていません。0円のところは、そのままでかまいません。",
        );
      await postJournal(
        tx,
        ws.ownerId,
        {
          requestKey: crypto.randomUUID(),
          date: dateText(setting.startDate),
          memo: OPENING_MEMO,
          lines: built.lines,
        },
        "MANUAL",
      );
      await recordAudit(tx, ws, {
        action: "OPENING_BALANCE",
        entity: "JOURNAL",
        summary: `開始残高を登録（資産 ¥${built.assets.toLocaleString("ja-JP")}／負債 ¥${built.debts.toLocaleString("ja-JP")}）`,
      });
      return built.equity;
    });
    refresh();
    return { ok: true, equity };
  } catch (e) {
    return failure(e);
  }
}
