# 4-3 開発・本番の環境変数分離と開発版ビルド（2026-10-18）

## 環境と公開値

ローカル設定はGit対象外の `.env.development.local`（開発Supabase）と `.env.production.local`（本番扱いSupabase）に分離されている。両方の公開用キーは異なり、各URLの `/auth/v1/settings` は対応するキーでHTTP 200、入れ違えたキーでHTTP 401を返した。Viteの設定はビルドモードとSupabase URLのプロジェクトIDを照合する。

本番PagesのActionsはRepository secretsから本番用の `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_MAPBOX_TOKEN` を受け取り、productionモードでビルドする。開発版はソース側でdevelopmentモードの静的ビルドを作り、別リポジトリのActionsが制限付き公開Mapboxトークンを差し込む。

## 開発版を再現する手順

ソースリポジトリで次を実行する。`npm ci` は依存関係の初回準備・lockfile変更時に行う。

```bash
npm run prepare:dev-pages -- backups/20261017-dev-pages-repo
```

`scripts/prepare-dev-pages.mjs` は、対象が`heinekogit/cycling-book-web-dev`のクリーンな`main`作業コピーであることを先に検査する。開発用Supabase URLと公開キーの組み合わせをAuth APIで照合し、Mapboxの実トークンをプレースホルダーで上書きして`/cycling-book-web-dev/`用にビルドする。生成JSは開発Supabaseだけを参照し、本番Supabase参照・実トークンがないこと、Mapboxプレースホルダー2箇所、Pagesのベースパスを確認する。`404.html`を用意してから静的ファイルだけを開発リポジトリの作業コピーへ配置する。対象を省略するとビルド・検査だけ行う。

このコマンドは**GitHubへpushしない**。配置後に開発リポジトリ側で`git diff`を確認し、コミット・pushすると既存Actionsがプレースホルダーをsecretから差し替えてPagesへ公開する。ソース本体、`.env.*.local`、実Mapboxトークンを開発リポジトリへコピーしない。

## 検証結果と残件

- 通常実行とローカル開発リポジトリへの配置が成功した。作成物は公開中の`14e2628`とファイル差分ゼロで一致したため、pushは不要だった。
- 本番Supabase URL、本番用公開キー、または本番ソースリポジトリを誤って指定した実行は、いずれも配置前に失敗した。
- 通常の`npm run build`では本番Supabase参照のみを含み、開発Supabase参照はなかった。本番モードに開発用URLを渡すとビルドは失敗した。
- `npm run lint`が成功。公開済み本番・開発JSのSupabase参照の分離は`github-deployment-inventory-20261018.md`に記録済み。

**4-3は環境分離と再現可能な開発版ビルド手順の整備として完了**。本番リポジトリの未pushコミットを公開する手順、ブランチ保護、切り戻しは4-2/4-10で扱う。現在の開発版はソースからGitHub Actionsが自動ビルドする構成ではなく、検証済み静的ビルドを別リポジトリへ渡す方式のまま。これは4-12のデプロイ自動化の対象。
