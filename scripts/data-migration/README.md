# データ移行（Backfill）

旧システムのデータを、新版の仕様へ移す。**既存データは削除・初期化しない。何度実行しても同じ結果になる。**

## 安全のための決まり
- 初期値は「確認だけ」。書き込むのは `APPLY=1` のときだけ。
- `EXPECT_HOST` に、実行先のホスト名を指定する。`DATABASE_URL` のホストと違うと、止まる（本番を間違えて指さないため）。
- 実行のたびに、変更前後の件数と、更新した対象を、画面と `scripts/data-migration/logs/*.json` に出す（ログには個人情報・金額は入れない。請求書番号とIDだけ）。
- User / Company / Invoice / InvoiceItem の件数が減ったら、失敗として止まる。

## 手順（STEPS に、カンマ区切りで指定）
| 手順 | 内容 | 自動でよいか |
|---|---|---|
| `report` | 件数の確認だけ（既定） | はい |
| `tax-category` | 税率10%・8%の請求書で、区分が空の明細に、同じ税率の区分を入れる。金額が変わらないことを確認してから行う。税率0%は触らない | はい |
| `init-accounting` | 会計の初期設定。`INIT_ACCOUNTING="ユーザーID:開始日:業種"` を明示したときだけ | **開始日と業種は、利用者が決める** |
| `received` | 入金日の取り込み。`RECEIVED_CSV=ファイル`（`請求書番号,YYYY-MM-DD`） | **入金日は、利用者が決める** |
| `ledger` | 会計の設定がある事業所の、発行済み請求書・支払いを、帳簿に連携 | 会計の設定が済んでいれば、はい |

## 実行例（検証用ブランチ）
```bash
export DATABASE_URL="$(cat ~/.seiq-migtest-url)"
export EXPECT_HOST="<検証用ブランチのホスト名>"
# 1) 確認だけ
DATA_MIGRATION=1 STEPS=report,tax-category,ledger npx vitest run --config scripts/data-migration/vitest.config.mts
# 2) 書き込む
APPLY=1 DATA_MIGRATION=1 STEPS=tax-category,ledger npx vitest run --config scripts/data-migration/vitest.config.mts
```
本番に実行するときは、検証用ブランチで同じ手順を確認し、`EXPECT_HOST` を本番のホスト名にして、先に Neon の Snapshot を作る。

## 本番に実行するときの順番
1. `tax-category`（先に。帳簿へ連携したあとに区分を入れると、連携済みの仕訳が、訂正の仕訳つきで作り直されるため）
2. 利用者が決めた内容で、`init-accounting`（会計の初期設定）
3. 利用者が用意した入金日で、`received`
4. `ledger`（帳簿へ連携）
いずれも、先に `APPLY` なしで確認し、ログの件数を見てから、`APPLY=1` で実行する。
