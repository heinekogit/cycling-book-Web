# DBマイグレーションの基点と運用（2026-10-17）

## 対象

- 既存の本番扱いプロジェクト: `cqiqhczxuiyakptdjowr`（PostgreSQL 17.6）。利用者データを保持。
- 開発用プロジェクト: `cyutxspjthlodvgchnst`（PostgreSQL 17.11）。現状は確認済みテストユーザー1件のみ。
- パスワードはGit対象外の `.backup-secrets/pgpass` と `.backup-secrets/dev-pgpass` に保存。接続先を取り違えないこと。

## 比較結果

両DBの `public` スキーマを2026-10-17に読み取り専用で `pg_dump --schema-only --no-owner --no-privileges` 取得し、版表示とダンプごとの `\\restrict` 値以外は完全一致した。`auth.users` のアプリ登録トリガー、`storage.objects` の10ポリシー、`route-photos` バケット、3プランも一致した。取得ファイルはGit対象外の `backups/20261017-dev-baseline/` に保存。

最初の権限付き比較では、新規Supabase側の既定GRANTが匿名・ログイン済みロールに余分な `TRUNCATE` 等を与えていた。また既存DBの `route_markers` は匿名に `ALL` を与えていた。以下のSQLを開発用で先に確認し、必要なものだけ既存DBへ反映した。

| SQL | 開発用DB | 既存DB |
| --- | --- | --- |
| `baseline/001`〜`003` | 2026-10-17に一度適用 | 現行状態の抽出元。再適用なし |
| `baseline/004_fresh_project_acl.sql` | 2026-10-17に一度適用 | 不要。既存テーブルの余分な初期GRANTはなかった |
| `migrations/20261017000100_route_markers_anon_select_only.sql` | 一度適用 | 開発用検証後に一度適用 |
| `migrations/20261017000200_secure_default_privileges.sql` | 一度適用 | 開発用検証後に一度適用 |

匿名の `route_markers` は両DBでSELECTのみとなり、ログイン済みユーザーのINSERTとRLSは維持した。既存公開APIの匿名読み取りはHTTP 200。両DBの `public` 16テーブル・19関数・2シーケンスについて、`anon` / `authenticated` / `service_role` の実効権限266行が一致した。`postgres` が将来作るオブジェクトの既定権限24行も一致し、ブラウザロールへの自動GRANTをやめ、`service_role` の権限を維持した。新しいオブジェクトの権限は、その変更SQLで明示する。

## 履歴の基点

旧16本は `supabase/archive/pre_baseline_20261017/` に移した。初期テーブルのCREATEを欠くため、これらを空DBや現行DBに再実行しない。現行状態を再現する正本は、`supabase/baseline/001`〜`004` を順番に組み込んだ `supabase/migrations/20261017000000_baseline.sql`。以後は14桁日時の前進マイグレーション2本が続く。

Supabase CLI 2.121.0の `migration repair --status applied` を使い、実スキーマ・権限を照合した**後で**、両DBの履歴に次の3件を記録した。`migration repair` は履歴表だけを更新し、SQL本体を実行しない。ベースラインを既存DBに流してはいない。

1. `20261017000000` — baseline
2. `20261017000100` — route_markers匿名SELECT限定
3. `20261017000200` — 将来の既定権限の制限

両DBで `migration list` のローカル・リモート3件が一致し、`db push --dry-run` は `Remote database is up to date` / pending 0件を返した。これは履歴の整合確認であり、今後の全変更が自動的に安全になるという意味ではない。

## 次の変更の手順

1. 14桁日時のSQLを `supabase/migrations/` に追加する。既存定義・依存関係を確認し、変更前のバックアップを取得する。SQL内で新しいテーブル・関数のGRANTとRLSを明示する。
2. **開発用DBの接続先IDを確認**し、CLIの `migration list` と `db push --dry-run` で予定SQLだけが未適用であることを確認してから反映する。Auth/Storage APIと2ユーザーRLSの関連動作を検証する。
3. 同じSQLファイルを変えずに、既存DBの接続先IDとバックアップを確認する。`migration list`、`db push --dry-run` を確認し、予定SQLだけを反映する。直後に構造・権限・主要APIを読み取り専用で照合する。
4. `migration list` が食い違う場合は止める。`migration repair` は**実DBに変更が存在すると証明したバージョンだけ**に使う。履歴を合わせる目的でSQLを再実行しない。`db reset --linked` は既存DBを削除するので実行しない。

CLIは `--db-url` または明示的にリンクしたプロジェクトへ接続する。コマンドにパスワードを直書きせず、Git対象外の資格情報から安全に渡す。CLIは `npx --yes supabase@2.121.0` を使用した。今回の適用ログ・比較用SQL・接続用ファイルは `backups/20261017-dev-baseline/` と `.backup-secrets/` にあり、Gitへ含めない。

復元試験、写真・ユーザーデータの移行、iOS版の接続先分離、開発用Webの地図API設定は別作業。DB履歴の基点確立とは混同しない。
