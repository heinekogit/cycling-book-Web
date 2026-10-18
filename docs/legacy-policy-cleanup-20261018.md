# 旧ルート・実走RLSポリシー整理（2026-10-18）

## 変更

`supabase/migrations/20261018000100_remove_legacy_routes_runs_policies.sql` は、旧所有者・旧所属・旧 `visibility` 判定を含む `routes` 9件、`runs` 7件のpermissiveポリシーを削除する。現行の `cycling_book_*` ポリシー8件とrestrictive境界は維持する。ベースラインや過去SQLを再実行しない。

## 開発用DB

接続先 `cyutxspjthlodvgchnst` を確認し、変更前アーカイブ `backups/20261018-legacy-policy-cleanup/dev-before.dump` を取得した。SHA-256は `3ead98a681c1e8bc0ff3e636508f78e0320f0c7301c6cbbb6fd9183b5c458290`。TOCを確認済み。すべてGit対象外。

まず旧ポリシー16件と履歴3件を読み取りで確認した。マイグレーションと仮Authユーザー2件を単一トランザクションで実行し、`two_user_rls.sql` 相当の本人・他人・匿名の閲覧／書込境界と写真関連境界を検証した。終了コード0、最後はROLLBACK。旧16件が残り、新しい履歴がないことも確認した。

次に同じSQLを開発用DBへ一度だけ適用し、履歴 `20261018000100` を同一トランザクションで記録した。適用後の2ユーザー試験も終了コード0、ROLLBACK。旧ポリシー0件、現行8件、履歴1件、仮Authユーザー0件、仮ルート0件を読み取りで確認した。匿名APIによる公開ルートSELECTも成功した（データ0件）。ログは同じGit対象外ディレクトリにある。

保存済みの開発用テストパスワードでAuth APIログインを試したところ `Invalid login credentials`。再試行しておらず、ログイン済みAPIの実測は未完了。DB上の2ユーザー権限試験は合格しているが、公開前にテストユーザーの認証を整え、Web画面とAPIから再確認する。

## 本番扱いDB

接続先 `cqiqhczxuiyakptdjowr` の変更前アーカイブ `backups/20261018-legacy-policy-cleanup/prod-before.dump` を取得した。SHA-256は `7c36f982b9d4a9ba21c5e9c654b2f191eb27523924991afb8d3fabae7c76378d`。TOCを確認済み。読み取りでは旧16件、現行8件、既存の履歴3件を確認した。

初回の本番ROLLBACK付き試験は自動承認審査で拒否された。本番の権限境界を一時的に変え、仮データを操作することへの明示承認が必要との判断。その後、ユーザーが「本番で試験・適用してよい」と承認した。

バックアップSHA-256、旧16件・現行8件・未適用履歴を再確認してから、本番で同じROLLBACK付き2ユーザー試験を行い、終了コード0・`ROLLBACK` を確認した。直後の読み取りで旧16件、履歴0件、仮Authユーザー0件を確認した。同じマイグレーションを本番DBへ一度だけ適用し、履歴 `20261018000100` を同一トランザクションで記録した。適用後の2ユーザー試験も終了コード0・`ROLLBACK`。最終確認では旧ポリシー0件、現行8件、履歴1件、仮Authユーザー・仮ルート0件。本番Supabaseの匿名APIから公開ルート3件を読み取れ、全件 `is_public=true` だった。試験・適用ログはGit対象外の同じバックアップディレクトリに保存した。

**このSQLは両DBへ適用済み。再実行しない。** ログイン済みWeb/APIの通し試験は別途必要。

## 関数権限

アプリの直接RPCは `set_route_publication`、`get_public_profile`、`delete_my_empty_account` の3件。`current_user_account_id` は旧ポリシーから参照されるが、旧トリガー関数 `set_owner_account_id_default` も参照する。`is_app_developer` は現行のルート・写真ポリシーで参照する。Storageの `can_access_cycling_photo_object` も現行ポリシーに必要。このため、関数本体の削除やEXECUTE権限の縮小は今回のマイグレーションへ混ぜず、依存関係とRPCアクセスを別に検証する。
