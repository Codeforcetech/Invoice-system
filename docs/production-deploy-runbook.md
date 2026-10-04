# 本番デプロイ手順（既存データを保持したまま更新する）

前提：本番は Vercel（main への push で Production Deploy）＋ Neon（Prisma）。
Vercel の Build Command は `npx prisma generate && npx prisma migrate deploy && next build`（**push するとビルド中に Migration が自動で実行される**）。

## 変更内容（origin/main → 更新版）
- Migration：既存4件に、新規19件を追加（合計23件）。**既存データを消す・書き換える操作はない**（列と表の追加のみ）。
  - 既存表への追加：`Invoice`（receivedDate / mergedIntoId / receiptMatchId / recurringKey）、`InvoiceItem`（taxCategory / storeId）、`Expense` は新規表。いずれも空でよい列。
  - 新しい表：35個。
- 予行演習：4件適用済みの空に近い DB に、ユーザー・取引先・請求書・明細を入れ、`migrate deploy` → 件数が変わらず、`prisma migrate diff` で差分なしを確認済み。

## 順番（守ること）
1. Vercel の Preview の `DATABASE_URL` を、本番とは別の DB（Neon の検証用ブランチ）に切り替える。**これより前に、更新ブランチを push しない**（push すると Preview のビルドで Migration が走る）。
2. Neon の検証用ブランチ（本番のコピー）に、Direct 接続（pooled ではない）で Migration：
   `DATABASE_URL='<検証用Direct>' npx prisma migrate deploy` → `npx prisma migrate status`（23件）。
3. 件数（User / Company / Invoice / InvoiceItem）が前後で同じことを確認。
4. 更新ブランチを push → Preview で画面を確認（ログイン、既存の取引先・請求書、一覧、詳細、新規作成、編集、PDF、売上管理表、提出）。Vercel Logs にエラーがないこと。
5. 本番：Neon の Snapshot を作る（または復元可能な時点を確認）。
6. 本番 Direct 接続で `npx prisma migrate deploy` → `migrate status`（23件）→ 件数を確認。
7. main へ反映 → push → Production Deploy（ビルド中の `migrate deploy` は、適用済みのため何もしない）。
8. 反映後の確認：既存ユーザー・取引先・請求書が残っている／ログインできる／請求書の一覧・詳細・新規・編集・PDF／売上管理表／Vercel Logs。

**本番では実行しない**：`prisma migrate reset` / `prisma db push`（特に `--force-reset`）/ `prisma db seed` / DROP・TRUNCATE。

## 本番の環境変数（反映前に確認）
- `AUTH_SECRET`：**32文字以上**（本番で32文字未満だと、アプリが起動しない）。既存の値を変えると、全員がログアウトされる。
- 任意（なくても動くが、その機能は使えない）：`ANTHROPIC_API_KEY`（AIの読み取り）、`RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` / `NOTIFICATION_APP_URL`（メール通知）、`NOTIFICATION_JOB_SECRET`、`NEXT_PUBLIC_GOOGLE_CLIENT_ID`。
- 更新版では使わない：`RESEND_FROM_EMAIL` / `NEXT_PUBLIC_APP_URL` / `RESEND_DEV_REDIRECT_TO`。
