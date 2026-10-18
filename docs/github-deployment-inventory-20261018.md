# GitHub・Webデプロイ構成（4-1、2026-10-18）

## 現在の公開経路

| 用途 | リポジトリ / ブランチ | Pages URL | 最新成功デプロイ | ビルド・接続先 |
| --- | --- | --- | --- | --- |
| 本番扱いWeb | `heinekogit/cycling-book-Web` / `main` | `https://heinekogit.github.io/cycling-book-Web/` | `a60f495`、2026-10-13 22:54 JST | `deploy-pages.yml` がpush/手動実行でNode 22・`npm ci`・`npm run build`を実行し、`dist`をPagesへ配置。Actions secretsからSupabase URL・publishable/anon key・Mapbox tokenを渡す。 |
| 開発Web | `heinekogit/cycling-book-web-dev` / `main` | `https://heinekogit.github.io/cycling-book-web-dev/` | `14e2628`、2026-10-17 23:44 JST | リポジトリは`index.html`・`404.html`・`assets`等の静的ビルド。Actionsが制限付き公開Mapbox tokenをsecretからビルドJSへ差し込み、Pagesへ配置。Supabase接続先はビルド済みJSに含まれる。 |

両リポジトリは公開設定で、GitHub API上の既定ブランチは`main`のみ。ブランチ保護は両方とも無効。両URLはHTTPSでHTTP 200を返し、公開済みJS（`modulepreload`を含む）は本番版に`cqiqhczxuiyakptdjowr`のみ、開発版に`cyutxspjthlodvgchnst`のみを含むことを読み取りで照合した。開発版にMapboxプレースホルダーは残っていない。

本番リポジトリの最新Actions実行: <https://github.com/heinekogit/cycling-book-Web/actions/runs/38408809774>。開発リポジトリの最新Actions実行: <https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39042002504>。どちらも`success`。GitHub Pages設定APIは認証なしでは404となったため、管理画面の設定値そのものではなく、ワークフロー定義・成功履歴・公開ファイルで経路を照合した。

## ローカルとの違いと後続項目

この作業時点のローカル本番リポジトリ`main`は`d4ba8d9`で、`origin/main`の`a60f495`より**11コミット先行**している。ローカルの`vite.config.ts`には開発・本番Supabase URLのビルド時検査があるが、公開中の本番ソースにはまだない。DBへのマイグレーション適用状態とGitHub Pagesのコード公開状態は別に管理する必要がある。今回pushやデプロイはしていない。

開発用リポジトリはソースの自動ビルドではなく、ローカルで作った静的ビルドを別途pushする方式。開発版でコードを検証するたびにビルド・配置・接続先確認が必要で、ソース`main`からの自動配布は未整備。

- **4-1 現行GitHub・デプロイ構成の確認:** 完了。
- **4-4 Web版のテスト用URL整備:** URLが稼働し、開発DB接続と認証・地図の基本動作を確認済み。完了としてよい。
- **4-3 開発・本番の環境変数分離:** 2026-10-18に開発版の再現可能なビルド・配置手順と接続先検査を追加して完了。詳細は`web-environment-build-20261018.md`。ソースからの自動デプロイは4-12、本番公開・切り戻しの運用は4-2/4-10で扱う。
- **4-2 Gitの開発・公開ブランチ運用整備 / 4-10 デプロイ・ロールバック手順整備:** 未完了。両リポジトリは`main`へのpushで自動公開され、ブランチ保護もない。ローカルの11コミットを本番へ一括pushする前に、差分を分類し、開発版で試験し、公開手順と切り戻し点を定める。
