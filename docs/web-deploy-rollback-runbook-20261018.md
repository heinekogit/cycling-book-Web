# 4-10 Webデプロイ・切り戻し手順（2026-10-18）

対象はGitHub Pages上の**Web静的ファイル**。Supabase DB、Auth、Storage、Mapbox設定はこの手順では切り戻さない。Web旧版が変更後DBでも動くことをリリース前に確認する。DB変更が旧版と互換でない場合は、Webだけを戻す判断をしない。

## 現在の切り戻し起点

| 環境 | 公開リポジトリ | 現在の成功コミット | 成功Actions実行 | デプロイID |
| --- | --- | --- | --- | --- |
| 本番扱い | `heinekogit/cycling-book-Web` | `a60f495` | [38408809774](https://github.com/heinekogit/cycling-book-Web/actions/runs/38408809774) | `7040393696` |
| 開発 | `heinekogit/cycling-book-web-dev` | `14e2628` | [39042002504](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39042002504) | `7141215880` |

2026-10-18時点で両デプロイは`success`。公開URL、SPAの`404.html`、公開JS内のSupabase参照を次の読み取り専用コマンドで検証した。

```bash
npm run check:pages -- production a60f495
npm run check:pages -- development 14e2628
```

この表は今後のデプロイごとに更新する。**切り戻し先は「直近のコミット」ではなく、動作確認済みの成功デプロイ**から選ぶ。

## デプロイ前

1. 対象環境と予定コミットを決める。Git作業ツリーの未コミット変更、`origin/main..HEAD`、公開される差分を確認する。ユーザーのメモなど対象外ファイルはステージしない。
2. 現在の`check:pages`結果と成功Actions実行URLを記録し、旧版が変更後DBと互換か確認する。DBマイグレーションの適用・復旧は別手順で管理する。
3. 開発版へ先に公開する。`npm ci`、`npm run lint`、`npm run prepare:dev-pages -- <開発Pagesリポジトリのクリーンなローカルコピー>`を実行。生成差分を確認してから、その開発Pagesリポジトリの`main`をpushする。Actionsの成功を待ち、`npm run check:pages -- development <新しいコミット>`とログイン・ルート・写真の主要操作を確認する。
4. 本番扱いWebの公開は、4-2のブランチ運用と差分レビューを終えてから行う。本番リポジトリの`main`へのpushで`deploy-pages.yml`がビルド・公開する。最新Actionsの成功を待ち、`npm run check:pages -- production <新しいコミット>`と主要画面を確認する。失敗したActionsを確認せずに続けてpushしない。

## 公開後に問題があったとき

1. 新たなpushを止め、対象環境の最新Actions・デプロイID・公開画面を確認する。GitHub Pagesにはキャッシュがあるため、期待コミットと公開ファイルの両方を`check:pages`で照合する。
2. 30日以内の動作確認済み成功Actions実行があれば、その実行ページで**Re-run all jobs**を選ぶ。GitHub公式仕様では再実行は元の`GITHUB_SHA`と`GITHUB_REF`を使う。`Re-run failed jobs`では公開ジョブが再実行されない可能性があるため、全ジョブを選ぶ。再実行は元の実行から30日以内、最大50回。現在の本番・開発の起点は上表のリンク。
3. 再実行が利用できない、または失敗した場合は、動作確認済みコミットから専用の一時ブランチを作り、既存ワークフローの`workflow_dispatch`をそのブランチで手動実行する。両ワークフローは`main`へのpushだけを自動公開対象にしているため、一時ブランチのpushだけでは公開されない。ブランチ側のワークフロー定義とPages environmentの許可を確認してから実行する。
4. デプロイ成功を待ち、`npm run check:pages -- <環境> <切り戻し先SHA>`でデプロイID・SHA・HTTPS/SPA・Supabase参照を確認する。ログインと主要操作を再確認し、結果を記録する。切り戻し後の`main`は問題のあるコミットを含み得るので、次のmain pushで再発しないよう4-2の公開ブランチ運用で修正する。

再実行または一時ブランチからの公開は**Web配信物だけ**を変える。DBのダンプ復元や既存SQLの再適用を同時に行わない。GitHub Actionsの再実行・手動実行方法は[GitHub公式の再実行手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)と[手動実行手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)に従う。

一時ブランチ方式では、元の作業ツリーに未コミット変更があっても巻き込まないよう、別の空ディレクトリに対象リポジトリをcloneする。次は本番扱いの現行成功コミットを使う例。開発版ではリポジトリ名と成功SHAを上表の値に置き換える。ブランチ作成後、GitHub Actions画面の「Run workflow」でそのブランチを選び、**手動実行で公開する**。

```bash
CB_REPO='cycling-book-Web'
CB_GOOD_SHA='a60f495'
CB_ROLLBACK_BRANCH='rollback/20261018'
git clone "https://github.com/heinekogit/${CB_REPO}.git" /tmp/cycling-book-pages-rollback
git -C /tmp/cycling-book-pages-rollback switch -c "$CB_ROLLBACK_BRANCH" "$CB_GOOD_SHA"
git -C /tmp/cycling-book-pages-rollback push -u origin "$CB_ROLLBACK_BRANCH"
```

## 検証範囲

この手順の読み取り専用検査は両環境で成功し、誤った期待コミットの指定は拒否された。**実際の旧版再デプロイはまだ行っていない**。開発版で一度、旧成功実行の再実行→元の最新版の再実行を行い、GitHub Pagesの復旧時間と画面動作を確認することが運用リハーサルとして残る。したがって4-10は「手順作成済み」、実地検証は未完了と記録する。
