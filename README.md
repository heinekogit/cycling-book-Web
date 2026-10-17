# Cycling Book Web

Cycling BookのWebサービス版です。Vite、React、TypeScriptで開発します。

## 開発

```sh
npm install
npm run dev
```

## 確認

```sh
npm run lint
npm run build
```

`.env.example`を基に`.env.local`へSupabase等のブラウザ公開設定を用意します。

## メール認証の設定

Web版には新規登録、メール確認、パスワード再設定の画面があります。Supabase Dashboardの **Authentication → Sign In / Providers** で「Allow new users to sign up」と「Confirm email」を確認してください。メール認証は同画面の「Email」で有効にします。**Authentication → URL Configuration** のRedirect URLsには、利用するURLを登録します。

- 開発環境: `http://localhost:5173/auth/callback` と `http://localhost:5173/reset-password`（127.0.0.1で開く場合はそのホストのURLも登録）
- 公開環境: `https://heinekogit.github.io/cycling-book-Web/auth/callback` と `https://heinekogit.github.io/cycling-book-Web/reset-password`

公開時は、確認メールと再設定メールを安定して送るため、SupabaseのカスタムSMTPも設定します。メールのリンク先がアプリへ戻ること、期限切れ時に再発行できることを実機で確認してください。GitHub Pagesの深いURLには、デプロイ処理が`404.html`を配置します。

一般ユーザー向けRLSへの移行と、個人アカウントのowner所属生成は適用済みです。実施内容と検証結果は `docs/auth-smoke-test-20261012.md` を参照してください。開発用・本番用Supabaseの接続先と保存先の分離は `docs/web-environment-isolation-test-20261017.md` で確認済みです。DBと写真の隔離復元、ローカルSupabaseでのAuthログイン・Storage API閲覧は `docs/db-backup-restore-test-20261018.md` に記録しました。Hosted Supabaseの新規プロジェクトでの復旧は未検証です。

## ローカルのSupabase接続先

`npm run dev` と `npm run build -- --mode development` はGit対象外の `.env.development.local` から `cycling-book-dev` に接続します。`npm run build` は `.env.production.local` から従来の本番扱いプロジェクトへ接続します。共通の `.env.local` は置かないでください。GitHub PagesのビルドはRepository secretsを使用し、従来の本番接続先を維持します。`vite.config.ts` はモードとSupabase URLのプロジェクトIDを照合し、接続先の取り違えがあればビルドを止めます。公開キー以外のDBパスワードやservice roleキーを `VITE_` 環境変数に設定しないでください。

2026-10-17に両モードのビルド、公開中の本番・開発用URL内の接続先、各環境のAuth API公開キーを確認済みです。開発用の公開URLには利用先を制限したMapbox公開トークンを設定済みです。設定と検証結果は `docs/dev-mapbox-deployment-20261017.md` を参照してください。

## GitHub Pages

GitHub Pagesは`main`ブランチへのpushで自動公開されます。

GitHub Actionsで使用するRepository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

GitHubの **Settings → Pages → Build and deployment → Source** では **GitHub Actions** を選択します。
このリポジトリの公開URLは `https://heinekogit.github.io/cycling-book-Web/` です。開発用Supabaseに接続する別マシン用テストURLは `https://heinekogit.github.io/cycling-book-web-dev/` です。こちらの静的ビルドは別リポジトリ `heinekogit/cycling-book-web-dev` にあり、GitHub Actionsが公開時に制限付きMapbox公開トークンを設定します。

最新の既存版は `/Users/dev_tomo/Desktop/cy2` にあります。既存HTMLを原本として参照し、画面単位でReactへ移行します。

## Supabase migrations

変更SQLは `supabase/migrations/` で管理します。初期状態は `20261017000000_baseline.sql`、以後は14桁日時の前進マイグレーションです。旧16本は `supabase/archive/pre_baseline_20261017/` に履歴資料として退避しました。既存DBと開発用DBの実状態を照合し、両方のCLI履歴に適用済みとして登録したため、**ベースラインと旧16本を既存DBへ再実行しないでください**。次の変更手順と接続先の確認は `docs/db-migration-workflow-20261017.md` を参照してください。

新しい写真モデルと段階移行方針は`docs/photo-storage-design.md`にまとめています。
