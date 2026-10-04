# エンジニア向け：本番に出す前の確認項目（追加機能）

「領収書のAI読み取り」「月ごとの売上と費用」「業務委託メンバーの提出」「外部の提出リンク」「請求書のAI取り込み」を追加した分の、確認項目。全体の手順は [HANDOFF.md](HANDOFF.md) の §6、セキュリティの全体像は [security-review.md](security-review.md) を参照。

## 1. 最優先：ログインなしの入口（外部の提出リンク）

入口：`/s/{token}`、`/s/{token}/files/{id}`、`actions/public-submission-actions.ts` の3つのサーバー処理（`submitViaLink`／`withdrawViaLink`／`resubmitViaLink`）と、`readInvoiceViaLink`。

| 確認すること | 見る場所 |
|---|---|
| 認証なしで到達できるのは、上の入口だけか（他の `/api`・サーバー処理が、役割の確認なしになっていないか） | `src/app/api/**/route.ts`、`actions/*.ts`、`middleware.ts` |
| 無効・期限切れ・取り消しのリンクが、すべて同じ応答（404／同じ文面）か | `lib/submissions/link.ts` `findActiveLink`、`gate()` |
| トークンが、ハッシュでしか保存されていないか（ログ・監査にも出ていないか） | `prisma/schema.prisma` `SubmissionLink`、`actions/submission-link-actions.ts` |
| 他のリンクの提出・添付が、見えない／触れないか | `lib/submissions/public.ts`、`/s/[token]/files/[fileId]/route.ts` |
| 上限の判定が、同時送信ですり抜けないか（リンクの行の更新で直列化） | `submitViaLink`、`resubmitViaLink`、`readInvoiceViaLink`（テスト：`tests/submission-link-db.test.ts` の「hardening」） |
| 外部サービス（Resend・Anthropic）へ送る内容と、キーの扱い | `lib/notifications/external.ts`、`lib/ocr/anthropic.ts` |

### 本番の構成で、必ず確認してほしいこと

1. **送り元IP**：`x-forwarded-for` の先頭を使っている（`clientAddress`）。ホスティングのプロキシが、クライアントから来た値を**上書き**する構成か確認する。そうでないと、送り元の制限は偽装できる（全体の上限・リンクごとの上限は、それでも効く）。ヘッダーがない場合は、送り元ごとの制限を行わない（全員が1つの枠を共有して、1人が使い切ると全員が止まる、を避けるため）。
2. **リクエストの大きさ**：サーバー処理の受け取り上限は4MB（`next.config.ts`）。ホスティング側の上限（例：サーバーレスの4.5MB）より小さいか確認する。画面側で、添付の合計を3.5MBまでに案内している。
3. **アクセスログ**：リンクのパス（トークン）が、ホスティングのアクセスログに残る。ログの閲覧権限・保存期間を確認する。
4. **`Cache-Control: private, no-store`**・`Referrer-Policy: no-referrer`・`X-Robots-Tag: noindex`（`next.config.ts` の `/s/:path*`）が、本番の配信でも付いているか（開発サーバーでは `Cache-Control` が上書きされる）。
5. **`ANTHROPIC_MESSAGES_URL`** は本番では設定しない（設定しても本番では無視される）。
6. **`PublicThrottle`** の古い行：リクエストの一部で自動的に消している（約2%の確率）。定期ジョブでも消したい場合は `purgeThrottle`（`lib/submissions/link.ts`）を使う。
7. 公開ページに、追加のCSP（`default-src` など）はない（`frame-ancestors` のみ）。外部スクリプトは読み込んでいない（確認済み）が、必要なら強化する。

## 2. 権限（提出者の役割）

- 新しい最下位の役割 `SUBMITTER`。会社のデータを返す画面・サーバー処理・出力用の窓口は、すべて「閲覧」以上を要求する。
- 出力用の窓口に、役割の確認が**なかった**（証憑・請求書PDF・支払いPDF・会計出力）。今回追加済み（`lib/auth/route-guard.ts`）。**他に抜けがないか**、`src/app/api` を全件確認してほしい（`tests/submitter-role-db.test.ts` が6本を確認）。
- 承認：自分の提出は承認できない。承認は、状態と版を確認し、会計のロックの中で行う。

## 3. データベース

追加のマイグレーション（5本）：

| 名前 | 内容 |
|---|---|
| `20261005100000_submitter_role` | `WorkspaceMember` の役割の検査に `SUBMITTER` を追加（**検査を作り直す**。追加のみではない） |
| `20261005110000_submissions` | 提出・明細・添付・経過・提出者の情報。`Expense.submissionId` |
| `20261005120000_submission_links` | 提出リンク、制限の数え上げ。`Submission.submitterId` を空にできるようにし、`linkId`・`contactEmail` を追加 |
| `20261005130000_submission_ai_flag` | `Submission.aiAssisted`・`aiNote` |

- ステージングで、本番のコピーに対して `migrate deploy` を予行する。
- ロールバック：アプリだけ前の版に戻しても動く想定。ただし、`SUBMITTER` のメンバーがいると、旧コードは役割を認識できず、そのメンバーは**自分だけの空の事業所の管理者として扱われる**（他人のデータは見えない）。

## 4. 環境変数（追加分）

| 名前 | 内容 |
|---|---|
| `ANTHROPIC_API_KEY` | AI読み取り（領収書・請求書）。未設定なら手入力のみで動く。**サーバー側のみ** |
| `RECEIPT_OCR_MODEL` | 任意。既定は `claude-haiku-4-5-20251001` |
| `INVOICE_OCR_DAILY_LIMIT` | 任意。事業所全体の、請求書のAI読み取りの1日の上限（既定100） |
| `RESEND_API_KEY`・`NOTIFICATION_FROM_EMAIL`・`NOTIFICATION_APP_URL` | 外部の提出者へのメール通知にも使う（再送の仕組みなし。結果は提出の経過に記録） |

Anthropic のコンソールで、**月の利用上限**を設定すること。

## 5. 個人情報・外部送信

- 領収書・請求書の画像／PDFは、読み取りのために Anthropic へ送られる（請求書は、氏名・住所・振込先を含む）。提出前の同意のチェックが必須（請求書）。領収書は、画面に注意書きのみ。会社として許容できるか、確認する。
- 外部の人が入力した氏名・住所・振込先・メールアドレスを保存する（提出と、リンクの前回入力）。**削除・保存期間の仕組みはない**。方針は未決定（顧客：特になし）。

## 6. 既知の制限（残るリスク）

ファイルのウイルス検査なし／差出人の氏名・登録番号は申告で未確認／メールの再送の仕組みなし／AIの読み取りは誤ることがある（承認者の確認が最後の砦）／提出した請求書のPDF生成なし／承認後の取消なし／レート制限は、分散した攻撃に限界がある／法令（インボイス・電子帳簿保存法・フリーランス法）への適合は保証していない。

## 7. 実行済みの確認

- 全テスト（単体・データベース）、型チェック、lint が通る。
- 実画面（ローカル）：リンクの発行→外部の人としての提出→取り下げ→出し直し→承認→支払管理への反映、請求書のAI読み取り（模擬のAPI）、提出者での会社の画面の拒否・出力窓口の403。
- **未確認**：本物のAPIでの読み取り精度、本物のメール送信、ホスティング環境でのヘッダー・プロキシ・サイズ上限、スマホ実機での表示。
