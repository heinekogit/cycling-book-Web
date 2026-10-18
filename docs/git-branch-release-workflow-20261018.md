# 4-2 Gitの開発・公開ブランチ運用（2026-10-18）

## 現在の分離

ソースリポジトリ `heinekogit/cycling-book-Web` の `main` は本番扱いPagesの公開起点。`main`へのpushまたは手動実行で `deploy-pages.yml` が公開する。ローカル`main`は公開中の`a60f495`に合わせた。ローカル`develop`はその後の14コミットを保持する。ユーザーの作業中メモは未コミットのままで、ブランチ分離に含めていない。

開発版Pagesは別リポジトリ `heinekogit/cycling-book-web-dev` の`main`から公開される。ソースの`develop`と開発版Pagesの`main`は別物で、後者には検査済みの静的ビルドだけを置く。開発版のビルド方法は `web-environment-build-20261018.md` を参照。

| ブランチ | 用途 | 公開動作 |
| --- | --- | --- |
| ソース`main` | 本番扱いWebの公開済みソース | pushで本番扱いPagesを再公開 |
| ソース`develop` | 次のリリース候補を統合 | pushでは本番公開しない。`Verify Web source`を実行 |
| ソース`feature/*` | 個別の修正 | PRで`develop`へ統合。必要なら`develop`から本番向けPRを作成 |
| 開発Pagesリポジトリ`main` | 開発版の静的ビルド | pushで開発版Pagesを再公開 |

## 通常の変更から公開まで

1. `develop`から`feature/*`を作り、対象の変更だけをコミットする。DBマイグレーションはWeb公開とは独立して適用・照合し、Web旧版との互換を確認する。
2. `develop`へのPRで差分を確認し、lintと型チェックを通す。秘密情報・`.env.*.local`・バックアップを含めない。ソース`develop`の変更は自動で開発Pagesへ配信されない。
3. `develop`から開発用ビルドを作り、開発Pagesリポジトリの`main`へ反映する。開発用Supabaseへの接続、ログイン、主要操作、`npm run check:pages -- development <公開SHA>`を確認する。
4. 本番へ出す範囲を`git diff main...develop`で確認する。現在の14コミットにはスキーマ・マイグレーション、監査記録、開発用ビルド手順、環境チェックが含まれる。一括で出すときも全ファイルをレビューし、DB側の適用済み状態と照合する。不要な変更があればリリース用ブランチで選別する。
5. `develop`またはリリース用ブランチから`main`へPRを作る。PRのlint・型チェック、開発版の確認結果、DB互換性、切り戻し先を確認した後でマージする。`main`へのマージは本番扱いPagesの公開操作になる。
6. Actions成功と`npm run check:pages -- production <公開SHA>`を確認し、主要操作を確認する。問題があれば `web-deploy-rollback-runbook-20261018.md` に従う。

## GitHub側の保護と現状

`Verify Web source`は`develop`へのpushと`main`向けPRでlint・型チェックを行う。SupabaseやMapboxの秘密情報をPRの実行環境へ渡さない。実際のproductionビルドは既存の`deploy-pages.yml`が`main`で行う。

GitHub側では、`main`へのPR必須、`Verify Web source / verify`の成功必須、force push・ブランチ削除の禁止を設定する。単独開発で承認者がいない間は「他者の承認必須」は設定しない。開発Pagesリポジトリ側も`main`が即公開なので、静的ビルドの差分確認と`check:pages`を必須の作業手順とする。

**2026-10-18時点:** ローカルブランチ分離と検証ワークフローは作成済み。`develop`/ワークフローのGitHubへのpushとGitHubのブランチ保護設定は未実施。本番扱いPagesと開発版Pagesへのデプロイは行っていない。したがって4-2の運用設計はできたが、GitHub上での強制はまだ未完了。
