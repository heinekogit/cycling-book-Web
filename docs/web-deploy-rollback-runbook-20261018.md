# 4-10 Webデプロイ・切り戻し手順（2026-10-18）

対象はGitHub Pages上の**Web静的ファイル**。Supabase DB、Auth、Storage、Mapbox設定はこの手順では切り戻さない。Web旧版が変更後DBでも動くことをリリース前に確認する。DB変更が旧版と互換でない場合は、Webだけを戻す判断をしない。

## 現在の切り戻し起点

| 環境 | 公開リポジトリ | 現在の成功コミット | 成功Actions実行 | デプロイID |
| --- | --- | --- | --- | --- |
| 本番扱い | `heinekogit/cycling-book-Web` | `a60f495` | [38408809774](https://github.com/heinekogit/cycling-book-Web/actions/runs/38408809774) | `7040393696` |
| 開発 | `heinekogit/cycling-book-web-dev` | `23ec2d7`（写真の公開表示修正版） | [39134691461](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39134691461) | `7155693635` |

2026-10-18時点で両デプロイは`success`。公開URL、SPAの`404.html`、公開JS内のSupabase参照を次の読み取り専用コマンドで検証した。

```bash
npm run check:pages -- production a60f495
npm run check:pages -- development 0e2e631
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

## 2026-10-18 開発版での切り戻し実地検証

1. 正常版`14e2628`のPagesデプロイ`7141215880`と公開HTML/JSを確認した。
2. 開発版`main`の`index.html`と`404.html`に画面動作を変えない目印を加えて`ed5d538`をpushした。[Actions実行39109163903](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39109163903)が成功し、デプロイ`7151680315`と公開HTMLの目印を確認した。
3. 元の成功[Actions実行39042002504](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39042002504)を全ジョブ再実行した。2回目の試行は成功し、デプロイ`7151687576`が`14e2628`を指し、公開HTMLから目印が消えた。`check:pages`も成功した。**成功実行の再実行で古い配信物に戻せることを実測した。**
4. 再実行だけではGitHub上の`main`は`ed5d538`のままになるため、一時コミットを`3c6c19e`でrevertしてpushした。[Actions実行39109296068](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/39109296068)とデプロイ`7151699553`が成功した。`3c6c19e`と元の`14e2628`はGit tree IDが一致し、最終公開HTMLに目印はない。開発版のHTTPS/SPA/Supabase参照と本番扱いWebの`a60f495`維持を`check:pages`で確認した。

この検証は**Web静的ファイルの配信と復旧**を確認したもの。ログイン・ルート編集・写真などの画面操作や、一時ブランチからの手動実行方式は未検証。後者は30日超過など再実行が使えない場合の代替手段として残る。4-10の手順整備と主要な切り戻し実地検証は完了。
