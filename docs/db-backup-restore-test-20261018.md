# DB・写真バックアップの復旧試験（2026-10-18）

## 結果

既存の本番扱いSupabase `cqiqhczxuiyakptdjowr` から、読み取りだけで新しいDBアーカイブと `route-photos` の実ファイルを `backups/20261018-restore-check/` に取得した。バックアップはGit対象外で、このMac上に保存した。DBアーカイブは1,348,562バイト、写真92件は計262,457,702バイト。DBと各写真のSHA-256およびサイズを照合した。

開発用Supabase `cyutxspjthlodvgchnst` 内に通常の `postgres` DBとは別の一時DB `cb_restore_test_20261018` を `template0` から作成し、バックアップを復元した。管理用の3項目を除外した復元は `pg_restore --exit-on-error` で成功した。アーカイブ内と復元先の54テーブル・3,121行の件数はすべて一致した。`auth.users` は6件、`public.accounts` は9件、`public.routes` は51件、`public.runs` は43件、`storage.objects` は92件。写真92件を別のローカル一時ディレクトリへコピーして全件のハッシュを再照合し、復元DBのStorage管理情報とファイル名・サイズが一致した。

試験用一時DBと一時接続ファイルは削除済み。本番DBと通常の開発DBには復元SQLを実行していない。ユーザー編集の `メモ_webやること` には触れていない。

## 復元時のSupabase管理項目

全アーカイブを `--no-owner --no-privileges` で一時DBへ復元すると、Supabase管理用の `realtime.list_changes` と `realtime.list_changes_sync` は `log_min_messages` 設定権限がなく作成できず、`vault.secrets` のCOPYも権限エラーになった。今回のアーカイブの `vault.secrets` は0行だった。そこで `pg_restore -l` のリストから**その3項目だけ**を除いた `restore-app-data.list` を作り、`--no-owner --no-privileges --exit-on-error --use-list` で再実行した。除外対象と復元ログはバックアップディレクトリに保存した。将来のアーカイブでVaultにデータがある場合、この除外手順をそのまま使わずに別途復旧方法を決める。

これはPostgreSQLのデータ・スキーマと写真ファイルの**隔離復元試験**である。一時DBはSupabase Auth/Storageサービスに接続されないため、復元後のログイン、確認メール、写真URL、Storage API経由の再アップロード・閲覧までは証明していない。それらを含むプロジェクト全体の災害復旧試験には、別の空のSupabaseプロジェクトが必要。DBと写真の取得は同時点の原子的スナップショットではないが、取得した92件についてDB管理情報の名前・サイズと実ファイルは一致した。

## 次回の手順

1. 接続先プロジェクトIDを確認する。既存DBへ復元しない。`pg_dump -Fc` で新しいDBアーカイブをGit対象外の新規ディレクトリへ保存し、サイズ・SHA-256・`pg_restore -l` を確認する。
2. 同ディレクトリにDBアーカイブ情報を含む `manifest.json` を作る。`CYCLING_BOOK_BACKUP_DIR` をそのディレクトリの絶対パスにして `python3 scripts/backup-storage.py` を実行する。スクリプトは前後のStorage一覧・サイズを照合し、実ファイルとハッシュのマニフェストを保存する。既存バックアップディレクトリを再利用しない。
3. 復元専用の**一時DBまたは空プロジェクト**を作る。通常の開発DBと本番DBは対象にしない。アーカイブの `vault.secrets` が0行であることを先に確認する。管理項目の除外は今回のアーカイブで確認した3項目だけとし、他のエラーは原因を調べる。
4. `pg_restore --no-owner --no-privileges --exit-on-error --use-list <確認済みリスト>` を隔離DBに実行する。アーカイブと復元DBの各テーブル件数、Storage管理情報と写真ファイルの名前・サイズ、全写真のSHA-256を照合する。必要ならサービスを備えた空プロジェクトでAuth・Storage APIを追加検証する。
5. 検証後、一時DB・一時接続ファイルを削除する。バックアップは引き続きGit対象外で保管し、別媒体へのコピーと復元試験も検討する。
