# Gmail下書き・PDF添付の設定

## 利用者の操作

1. 「設定」の送信元メールアドレスに、自分が利用するGmailまたはGoogle Workspaceの本人アカウントを登録する。
2. 「会社一覧」で取引先の請求先メールアドレスを登録する。未登録でも下書き作成画面で入力できる。
3. 請求書の作成・編集画面で「Gmail下書き」を選ぶ。最新の入力を保存してから文面とPDFを準備する。
4. 宛先・文面・「PDFを確認」を確認し、確認済みにチェックする。
5. 「Googleと連携して下書きを作成」で送信元と同じGoogleアカウントを選ぶ。
6. 「Gmailの下書きを開く」から該当件名を開き、Gmail上で手動送信する。

このシステムはメールを送信しない。Googleの `drafts.create` のみ使用し、旧Resend送信機能は削除した。
下書き作成を「送信済み」として扱わない。送信後の追跡・入金管理は別機能であり、今回自動判定していない。
送信元の別名・エイリアスは対象外。Googleから確認できる本人のメールアドレスと登録値が一致する必要がある。

## 管理者の初期設定（必須）

Google Cloudの操作・本番環境の変更はまだ行っていない。クライアントIDが空の環境ではGmail下書き作成ボタンを無効にし、PDFの確認・ダウンロードだけを提供する。

1. Google Cloudで対象プロジェクトのGmail APIを有効にする。
2. Google Auth Platformの同意画面にアプリ名・サポートメール・公開範囲を設定する。
3. テスト運用では利用者をテストユーザーに追加する。Workspace内部用か外部公開用かを選ぶ。外部向け本番公開には、Googleのスコープ審査要件を確認して対応する。
4. OAuthクライアントを「ウェブアプリケーション」で作成する。
5. 承認済みJavaScript生成元に `https://invoice-system-tau-amber.vercel.app` を登録する。ローカル用には `http://localhost:3000` を別途登録する。パス `/login` は付けない。
6. Vercelの対象環境に `NEXT_PUBLIC_GOOGLE_CLIENT_ID` を設定し、再ビルド・再デプロイする。これは公開識別子。クライアントシークレットは不要。
7. 既存の `DATABASE_URL`・`AUTH_SECRET` を確認し、設定画面に送信元と必要な会社情報を登録する。

Google Identity Servicesのブラウザ向けtoken modelを使用するので、サーバーのOAuthコールバックやリフレッシュトークン用DBマイグレーションは不要。
要求スコープは `openid email https://www.googleapis.com/auth/gmail.compose`。Googleには下書き作成だけに限定した独立スコープがなく、`gmail.compose` は送信権限も含む。UIでもこの点を説明するが、実装には送信API呼び出しを置かない。

参考: [Googleのtoken model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)、[Gmailの下書きAPI](https://developers.google.com/workspace/gmail/api/guides/drafts)、[OAuthスコープ](https://developers.google.com/workspace/gmail/api/auth/scopes)。

## PDFと印影

PDFはサーバー上で本人所有の請求書だけから生成し、ダウンロードレスポンスは `private, no-store` とする。日本語フォントはアプリに同梱し、外部フォントサービスへ請求内容を送らない。PDFはA4・複数ページ対応で、文字情報を保持する。

印影は512KB以下のPNG/JPEGをファイル登録する方法を推奨する。画像をデコード・サイズ制限・再エンコードしたうえでPDFへ入れる。Google Drive共有画像は固定のGoogle画像ホストからのみ取得し、リダイレクトは拒否する。その他の外部画像URLは画面表示のみ。PDF生成時に対応していない印影を検出すると、無言で欠落させず設定変更を案内する。

PDF準備時とGmail下書き作成直前に、請求書・会社・発行元設定の更新日時が同じか確認する。古いPDFを最新の請求書として添付しない。

## エラー時の動作

- 送信元不一致・権限拒否: 下書きを作らず修正方法を表示する。
- 通信切断などで作成結果が不明: 自動再試行しない。Gmailで未作成を確認してから再試行する。
- 下書き作成成功: 同じ画面での再作成を無効化する。画面を閉じて新しく作成した場合は別の下書きになるため、既存の編集はGmailで行う。
- メールアドレスや件名への改行挿入、不正PDF、巨大な画像・明細は拒否する。

## 検証と運用上の範囲

`npm test` で所有者チェック、JWT検証、MIME・添付バイト列、送信元検証、API失敗、SSRF対策、金額計算を検証する。Google API呼び出しはモックであり、実Gmailの下書き作成・送信は実行していない。ローカルで日本語PDFと複数ページの描画、ブラウザ操作、レスポンシブ表示も確認する。

`npm run lint`、`npx tsc --noEmit`、ビルド、`npm audit` を併用する。このローカル環境ではTurbopackのポート作成が環境制限により失敗するため、最終ビルドは `npx next build --webpack` で検証した。Next.jsを16.3.5へ更新し、PrismaのCLIが利用するdeepmerge-tsは脆弱性修正版8系にoverrideした。Prisma生成・ビルドを必ず更新時に確認する。

本番のGoogle同意画面、Google Workspace管理者ポリシー、実DBのアクセス権・ネットワーク設定はこのローカル検証の対象外。本番ではログインとPDF生成へのWAF・レート制限も設定する。PDF生成の同時実行制限はプロセス内の保護であり、複数のサーバーレスインスタンス全体を制御するものではない。
