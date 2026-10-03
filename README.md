# SEIQ（請求・売上・支払管理／会計）

請求書の作成・送付から、入金・支払の記録、仕訳・帳簿、経費精算、固定資産、経営レポート、消費税の区分、証憑の保管までを扱う Web アプリ。Next.js（App Router）/ TypeScript / Prisma / PostgreSQL。

**引き継ぎ・開発に入る方は、まず [docs/HANDOFF.md](docs/HANDOFF.md) を読んでください**（現状、設計、動かし方、環境変数、本番反映の手順、確認してほしい点、既知の制限）。

## すぐ動かす

```bash
npm ci
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec db psql -U postgres -c 'create database seiq_dev;'
docker compose -f docker-compose.dev.yml exec db psql -U postgres -c 'create database seiq_test;'
cp .env.example .env        # DATABASE_URL と AUTH_SECRET を設定
npx prisma migrate deploy
npm run seed                # 開発用の見本アカウント（本番では実行できません）
npm run dev
```

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build -- --webpack` | 本番ビルド（動作確認済みの方法） |
| `npm run lint` / `npx tsc --noEmit` | 静的チェック |
| `npx vitest run` | テスト。DBを使うテストは `RUN_ACCOUNTING_DB_TESTS=1 RUN_EXPENSE_DB_TESTS=1` と、テスト用の `DATABASE_URL` が必要（[HANDOFF.md §3](docs/HANDOFF.md)） |
| `npx prisma migrate deploy` | マイグレーションの適用（本番も同じ） |

## ドキュメント

- [docs/HANDOFF.md](docs/HANDOFF.md) — 引き継ぎ資料（最初に）
- [docs/security-review.md](docs/security-review.md) — セキュリティの点検結果と残るリスク
- [docs/accounting-phases.md](docs/accounting-phases.md) — 機能追加の経緯と検証の記録
- [docs/phase8-plan.md](docs/phase8-plan.md) — 税・証憑の計画
- アプリ内の「使い方ガイド」（`/guide`）— 利用者向けの説明
