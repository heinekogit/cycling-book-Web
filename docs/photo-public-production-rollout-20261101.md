# 写真ごとの公開選択：本番反映記録（2026-11-01）

本番扱いSupabase `cqiqhczxuiyakptdjowr` とWeb `heinekogit/cycling-book-Web`に写真ごとの公開選択を反映した。iOS公開ビルド・TestFlightはこの作業の対象外。

## 変更前の保全

- Git対象外の`backups/20261101-photo-public-release/`へ本番DB全体を`pg_dump -Fc`で取得。`database.dump`は1,344,208バイト、SHA-256は`a17a3c372fa94eb2c1cc51ab5853c8d2e01db9f11f791ad43e2b45e79d1bfec5`。`pg_restore -l`で読め、Auth usersとStorage objectsのテーブルデータを含む。
- 同ディレクトリへ`route-photos`の実ファイル92件、計262,457,702バイトを保存。取得前後のStorage一覧・サイズが一致し、各ファイルのSHA-256を`storage-manifest.json`へ記録。秘密鍵とバックアップ本体はGit対象外。
- 旧Pagesの成功起点は`e530779`、デプロイ`7310168764`。変更直前の`check:pages`でHTTPS・SPA・本番Supabase参照が正常。

## DB適用

- 予定SQL`supabase/migrations/20261025000200_public_photo_choice.sql`のSHA-256は`5d2691343228102aa3839ec867402fb8f297a96489780e419583de23ec8a3093`。開発版と本番候補のファイルが一致した。
- 適用直前に本番履歴の最終版`20261025000100`、新列未存在、ルート33の写真2行がともに`is_privacy_hidden=true`を照合した。前日には同じSQLを含む2ユーザー・匿名試験を単一トランザクションで実行し`ROLLBACK`した。
- `backups/20261101-photo-public-release/apply-once.sql`を**一度だけ**実行。未適用・写真非公開のガード、新SQL、履歴`20261025000200`登録、`COMMIT`を同一トランザクションで完了。これらのSQLを再実行しない。
- 適用後、履歴1行、新列2本、予定RLSポリシー2件を確認。ルート33の2行は`is_publicly_selected=false`・`public_image_url=null`・`is_privacy_hidden=true`。匿名からは0行。適用済みDBで合成本人・他ユーザー・匿名のRLS/Storage試験を実行し、試験データは`ROLLBACK`した。実ルート33の所有者ロールでは写真2行（有効1行）を読め、元画像Storageオブジェクト2件は残っている。

## Web公開

- [PR #2](https://github.com/heinekogit/cycling-book-Web/pull/2)を`main`へマージ。マージSHAは`6224395`。写真は初期非公開、公開選択した写真だけEXIF除去済みの公開用JPEGコピーを表示し、削除済み写真を一覧から除外する。
- [Pages Actions 41241703322](https://github.com/heinekogit/cycling-book-Web/actions/runs/41241703322)成功。Pagesデプロイ`7464341666`が`6224395`を指す。`npm run check:pages -- production 6224395`でHTTPS、SPAの`404.html`、本番Supabase参照を確認。
- 未ログインの[ルート33写真ページ](https://heinekogit.github.io/cycling-book-Web/routes/33/photos)で「0枚」を確認。所有者のWeb画面で有効写真1枚と公開選択ボタンが見えるかは確認待ち。

## 旧形式の元画像への所有者アクセス補正（2026-11-01）

所有者の画面には有効な写真1枚が表示されたが、画像が読み込めなかった。ルート33のStorageオブジェクト名は`1768010776083.jpg`のような旧形式の直下ファイル名で、既存の`can_access_route_photo_object`は`routes/33/...`形式だけを所有者へ許可していた。写真行とStorageオブジェクトは存在したが、所有者のStorage SELECTでは0件だった。

`20261101000100_legacy_route_photo_owner_access.sql`では、旧形式のファイル名を写真行の元画像・サムネイル参照と厳密一致させ、同じルートアカウントの所有者だけにアクセスを追加した。新形式の判定は維持する。本番で単一トランザクションの事前試験後に`ROLLBACK`し、所有者1件、別ユーザー0件、匿名0件を確認。開発DB、本番DBの順に各一度だけ適用し、履歴は両方とも1行。適用後の読み取り専用再試験も所有者1件、別ユーザー0件、匿名0件だった。所有者ブラウザで再読み込み後に11:06の写真が表示されたことを確認した。

[本番リポジトリのPR #3](https://github.com/heinekogit/cycling-book-Web/pull/3)は必須`verify`成功後に`main`へマージした。マージSHA`72c8dfb`、[Pages Actions 41244915359](https://github.com/heinekogit/cycling-book-Web/actions/runs/41244915359)成功、デプロイ`7464797111`。`npm run check:pages -- production 72c8dfb`でHTTPS、SPA、本番Supabase参照が正常。Web動作コードは変更していない。

以前発行された署名URLや第三者の保存済み画像・キャッシュは回収できない。旧Webへの切り戻しは新DBの列と公開用コピーの扱いが合わないため、障害時はまず前進修正を検討する。iOSの公開候補は[Draft PR #1](https://github.com/heinekogit/cycling-book-app/pull/1)に残り、TestFlight実機確認前に一般公開しない。
