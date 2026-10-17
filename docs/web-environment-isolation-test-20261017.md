# Web版の接続先分離・保存先検証（2026-10-17）

## 接続先

- ローカルのdevelopmentビルドと `https://heinekogit.github.io/cycling-book-web-dev/` の公開済みJSは `cyutxspjthlodvgchnst`（開発用）を参照した。
- ローカルのproductionビルドと `https://heinekogit.github.io/cycling-book-Web/` の公開済みJSは `cqiqhczxuiyakptdjowr`（本番扱い）を参照した。
- `.env.development.local` と `.env.production.local` の公開キーで、それぞれのAuth設定APIがHTTP 200を返した。資格情報の値はログ・Gitに含めない。
- `vite.config.ts` はビルドモードとSupabase URLのプロジェクトIDを照合する。誤った開発用URLをproductionモードに渡す試験では、ビルドが停止した。

## 開発用DBへの保存

既に確認メールのリンクで登録済みの開発用テストユーザー `tomokawa.cr+cb-dev-auth@gmail.com` を使用した。新たな登録メールは送っていない。Web版と同じ `@supabase/supabase-js` の公開キーとログイン済みユーザーの権限で、非公開の描画ルートを作成し、APIで読み戻した。保存時の主要カラムは `src/features/routes/editor-api.ts` の `createRoute()` と同じ構成にした。テスト用パスワードはGit対象外の既存ファイルから読み、出力していない。

テストルートは `ENV-ISOLATION-e1051c62-6edb-455c-a5bf-edccb21fc059`（開発用DBのID 2）。開発用DBには1件存在し、`is_public=false`。本番DBで同名ルートは0件だった。本番DBでは読み取り照会のみ行い、書き込みはしていない。テストルートは開発用データとして残している。

この結果は**開発用ユーザーでのAPI保存とDBの分離**を確認したもの。開発用の公開URLにはMapboxトークンを含めていないため、地図をクリックして作るブラウザ画面の一連の操作はまだ検証していない。実機のWeb UIでルート作成・編集・保存を確認するには、開発版の地図API設定を整える。
