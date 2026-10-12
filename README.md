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

一般ユーザー向けRLSへの移行と、個人アカウントのowner所属生成は適用済みです。実施内容と検証結果は `docs/auth-smoke-test-20261012.md` を参照してください。Supabaseの開発・本番2環境化と復元試験は引き続き未完了です。

## GitHub Pages

GitHub Pagesは`main`ブランチへのpushで自動公開されます。

GitHub Actionsで使用するRepository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

GitHubの **Settings → Pages → Build and deployment → Source** では **GitHub Actions** を選択します。
このリポジトリの公開URLは `https://heinekogit.github.io/cycling-book-Web/` です。

最新の既存版は `/Users/dev_tomo/Desktop/cy2` にあります。既存HTMLを原本として参照し、画面単位でReactへ移行します。

## Supabase migrations

変更SQLは `supabase/migrations` で管理します。現DBにはSupabase標準のマイグレーション履歴がなく、既存の初期スキーマ定義も不足しているため、このディレクトリを空のDBへ一括適用したり、現DBへ再適用したりしないでください。実DBからのベースライン整備が必要です。経緯は `docs/supabase-two-environment-readiness.md` を参照してください。

新しい写真モデルと段階移行方針は`docs/photo-storage-design.md`にまとめています。
