# DB・写真バックアップの復旧試験（2026-10-18）

## 結果

既存の本番扱いSupabase `cqiqhczxuiyakptdjowr` から、読み取りだけで新しいDBアーカイブと `route-photos` の実ファイルを `backups/20261018-restore-check/` に取得した。バックアップはGit対象外で、このMac上に保存した。DBアーカイブは1,348,562バイト、写真92件は計262,457,702バイト。DBと各写真のSHA-256およびサイズを照合した。

開発用Supabase `cyutxspjthlodvgchnst` 内に通常の `postgres` DBとは別の一時DB `cb_restore_test_20261018` を `template0` から作成し、バックアップを復元した。管理用の3項目を除外した復元は `pg_restore --exit-on-error` で成功した。アーカイブ内と復元先の54テーブル・3,121行の件数はすべて一致した。`auth.users` は6件、`public.accounts` は9件、`public.routes` は51件、`public.runs` は43件、`storage.objects` は92件。写真92件を別のローカル一時ディレクトリへコピーして全件のハッシュを再照合し、復元DBのStorage管理情報とファイル名・サイズが一致した。

試験用一時DBと一時接続ファイルは削除済み。本番DBと通常の開発DBには復元SQLを実行していない。ユーザー編集の `メモ_webやること` には触れていない。

## 復元時のSupabase管理項目

全アーカイブを `--no-owner --no-privileges` で一時DBへ復元すると、Supabase管理用の `realtime.list_changes` と `realtime.list_changes_sync` は `log_min_messages` 設定権限がなく作成できず、`vault.secrets` のCOPYも権限エラーになった。今回のアーカイブの `vault.secrets` は0行だった。そこで `pg_restore -l` のリストから**その3項目だけ**を除いた `restore-app-data.list` を作り、`--no-owner --no-privileges --exit-on-error --use-list` で再実行した。除外対象と復元ログはバックアップディレクトリに保存した。将来のアーカイブでVaultにデータがある場合、この除外手順をそのまま使わずに別途復旧方法を決める。

これはPostgreSQLのデータ・スキーマと写真ファイルの**隔離復元試験**である。一時DBはSupabase Auth/Storageサービスに接続されないため、復元後のログイン、確認メール、写真URL、Storage API経由の再アップロード・閲覧までは証明していない。それらの確認には、Supabase Auth/Storageサービスが稼働する別の検証環境が必要。追加試験の結果を次節に記録する。DBと写真の取得は同時点の原子的スナップショットではないが、取得した92件についてDB管理情報の名前・サイズと実ファイルは一致した。

## ローカルSupabaseでの追加試験（2026-10-18）

Freeプランのプロジェクト枠は本番用・開発用の2件で埋まっているため、このMac上にSupabase CLI 2.121.0とColimaの隔離環境を立てた。Dockerネットワークのポートは127.0.0.1に限定した。新しいローカルSupabase DBへ既存のベースラインと追加マイグレーション3本を適用し、バックアップから `auth.users`、`auth.identities`、`public` のアプリデータ（ベースラインで投入済みの `plans` を除く）、2シーケンスを復元した。データ投入時はトリガーによる二重生成を防ぐため、単一トランザクションで `session_replication_role=replica` を設定した。

ローカルAuth APIで、保存済みの本番用テストアカウントによるパスワードログインがHTTP 200となり、セッションとユーザーIDが返った。写真92件をローカルStorage APIへアップロードし、同APIから再取得した全件のサイズ・SHA-256がバックアップと一致した。復元したログインユーザーの権限で公開写真1件を取得するとHTTP 200となり、その画像のSHA-256も一致した。テストの資格情報やローカルのAPIキーはGitに保存していない。

ローカルSupabaseのコンテナ・テスト用データボリュームとネットワークは検証後に削除し、Colima VMは停止した。ローカル復元用に生成した `restore-data.sql` など、Authユーザーの複製を含む一時ファイルも削除した。バックアップ本体はGit対象外の `backups/20261018-restore-check/` に残す。

この追加試験で**DB、Authログイン、Storage APIの写真復元・閲覧まで動作確認済み**。Hosted Supabaseの新規プロジェクトへの復元、確認メール・リダイレクト・SMTPなど管理画面設定の再現、全ユーザーのログインは試していない。写真をStorage API経由で再アップロードしたため、Storageの内部オブジェクトIDや更新時刻が元と完全一致する試験ではない。

## 次回の手順

1. 接続先プロジェクトIDを確認する。既存DBへ復元しない。`pg_dump -Fc` で新しいDBアーカイブをGit対象外の新規ディレクトリへ保存し、サイズ・SHA-256・`pg_restore -l` を確認する。
2. 同ディレクトリにDBアーカイブ情報を含む `manifest.json` を作る。`CYCLING_BOOK_BACKUP_DIR` をそのディレクトリの絶対パスにして `python3 scripts/backup-storage.py` を実行する。スクリプトは前後のStorage一覧・サイズを照合し、実ファイルとハッシュのマニフェストを保存する。既存バックアップディレクトリを再利用しない。
3. 復元専用の**一時DBまたは空プロジェクト**を作る。通常の開発DBと本番DBは対象にしない。アーカイブの `vault.secrets` が0行であることを先に確認する。管理項目の除外は今回のアーカイブで確認した3項目だけとし、他のエラーは原因を調べる。
4. `pg_restore --no-owner --no-privileges --exit-on-error --use-list <確認済みリスト>` を隔離DBに実行する。アーカイブと復元DBの各テーブル件数、Storage管理情報と写真ファイルの名前・サイズ、全写真のSHA-256を照合する。必要ならサービスを備えた空プロジェクトでAuth・Storage APIを追加検証する。
5. 検証後、一時DB・一時接続ファイルを削除する。バックアップは引き続きGit対象外で保管し、別媒体へのコピーと復元試験も検討する。
