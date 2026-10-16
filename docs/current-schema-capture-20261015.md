# 現行DBスキーマ取得・初期定義の照合（2026-10-15）

## 結果

現行Supabase DBから最新のスキーマを読み取り専用で取得した。DBにSQLを適用していない。取得した完全なSQL、カスタム形式ダンプ、TOCは `backups/20261015-current-schema/` に保存し、Git対象外としている。定義には権限情報や設定値が含まれ得るため、このディレクトリを公開しない。

| ファイル | 用途 | SHA-256 |
| --- | --- | --- |
| `schema-with-acl.dump` | 所有者・GRANT・デフォルト権限を含むスキーマの正本 | `9b4416392e948c7e762cc595c2c39a1e9224fdb53baaa334387550024860cde4` |
| `schema.dump` | 所有者・GRANTを除いた比較用スキーマ | `dc91bbe9a6a82956cd607ebe5f569ecca1461615f6c59aebe6bfc82259a5a0cb` |
| `schema-with-acl.sql` | 正本を読みやすく展開したSQL | 正本から再生成可能 |
| `toc.txt` | `pg_restore --list` の目録 | 正本から再生成可能 |

`pg_dump` 18.6でPostgreSQL 17.6から取得し、`pg_restore` で目録とSQLを最後まで展開できた。これは**スキーマ取得の検証**であり、空のSupabaseプロジェクトへの復元成功を意味しない。データ、Authユーザー、Storageの写真ファイルもこのスキーマダンプには入らない。データ・写真の別途バックアップについては `supabase-two-environment-readiness.md` を参照。

## 取得した構造

全DBのTOCには、`public` の16テーブル、19関数、2独自enum、2シーケンス、6トリガーと、`auth.users` の独自トリガー1件がある。`public` のRLSポリシーは47件、`storage.objects` のポリシーは10件。`auth`・`storage` などSupabaseが管理する構造もダンプに含まれる。GRANT・デフォルト権限は正本に含めた。

`public` の16テーブルは `accounts`, `account_members`, `account_memberships`, `app_developers`, `orgs`, `plan_entitlements`, `plans`, `route_markers`, `route_photo_selections`, `route_private_geometries`, `route_spot_photos`, `routes`, `run_photos`, `runs`, `subscriptions`, `users`。

## 既存マイグレーションとの照合

`supabase/migrations` の現行16本を対象に、オブジェクト名と `CREATE TABLE` 定義の有無を照合した。現行DBにある次の9テーブルは、ローカルマイグレーションに作成定義がない。

`accounts`, `account_members`, `orgs`, `plans`, `route_spot_photos`, `routes`, `runs`, `subscriptions`, `users`。

また、独自enum `route_origin`, `run_mode`、シーケンス `routes_id_seq`, `runs_id_seq` の作成定義がない。関数 `current_user_account_id`, `set_owner_account_id_default`, `set_runs_account_id_from_auth` と、`auth.users` の `on_auth_user_created`、`routes` / `runs` の旧所有者・アカウント設定トリガーなどもマイグレーションに定義がない。関数・ポリシー名がSQL内にある場合でも、実DBとの本文・権限の完全一致までは今回証明していない。

DBに `supabase_migrations` スキーマが存在せず、適用済みバージョン表も取得できなかった。したがって、現行DBの各定義がどのファイルの適用結果かを、履歴表から証明することはできない。既存マイグレーションを実DBで再実行して履歴を作り直してはならない。

## 再現用初期スキーマに含める範囲

1. `public` のアプリ独自テーブル16件、独自enum・シーケンス、制約・インデックス・デフォルト値。
2. `public` のアプリ独自関数19件、`public` と `auth.users` に付けたアプリ独自トリガー。
3. `public` のRLS有効状態・ポリシー、`storage.objects` に付けたアプリ独自ポリシー、必要なGRANT・デフォルト権限。
4. 写真バケット `route-photos` の設定と、新規環境に必要な初期プラン等のデータは、スキーマDDLとは別の設定・seedとして管理する。

Supabaseが管理する `auth`・`storage` テーブルや関数の全DDLを、アプリ独自の初期スキーマとして流用しない。上記範囲を正本から切り出し、既存マイグレーションとの重複・順序を整理したうえで、**空の検証環境で再現できるか**を別項目で確かめる。Authのメール確認、SMTP、Redirect URLsなどDashboard側の設定はDBスキーマダンプだけでは再現できないため、別途記録する。
