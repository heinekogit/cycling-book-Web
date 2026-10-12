# Supabase 開発・本番2環境化の事前調査

調査日: 2026-10-11（日本時間）

注: 以下の構造・権限の記述は調査日時点のスナップショット。2026-10-12に一般ユーザー向けRLS、5テーブルのRLS、写真Storageの削除制限、新規登録時の個人owner所属生成を適用した。現状と検証結果は `auth-smoke-test-20261012.md` を参照。2環境化・初期スキーマ整備・復元試験は未完了。

## 判定

**2環境運用への移行は可能。ただし、現状のSQLを新しいプロジェクトへ順番に流すだけでは再現できず、移行準備完了とは判定できない。**

最優先は現在の権限問題の修正設計と、実DBを基にした再現可能な初期スキーマの整備。環境分離そのものと、一般ユーザーへの公開可否は別の判定とする。

## 調査方法と範囲

- リポジトリのSQL全11本、接続コード、アカウント・認証・写真API、デプロイ設定、既存資料を確認。
- ローカルの接続先と、ログイン済みSupabase Dashboardの `cycling-book` プロジェクトが一致することを確認。
- SQL Editorでカタログ・権限・関数・集計件数をSELECT。アプリデータ、DDL、RLS、履歴は変更していない。調査用の新規SQLタブを使用。
- 実DBの代表的な構造を照合した調査であり、完全なスキーマダンプの取得・全定義の機械比較・別環境への復元試験は未実施。
- Authの配信設定、リダイレクトURL、バックアップ復元、GitHub側に設定済みのSecrets、別プロジェクトの有無は未確認。

## 実DBの構造

publicには16テーブルが存在する。

| 分類 | テーブル | 実DBのRLS |
| --- | --- | --- |
| 既存アカウント・契約 | accounts, account_members, orgs, plans, subscriptions | 全て無効 |
| ユーザー・開発者 | users, app_developers | 有効 |
| 新しい所属・機能権限 | account_memberships, plan_entitlements | 有効 |
| ルート・実走 | routes, runs | 有効 |
| 写真 | route_spot_photos, run_photos, route_photo_selections | 有効 |
| 公開時の私有形状・マーカー | route_private_geometries, route_markers | 有効 |

構造上の要点:

- `users.id` / `account_id` はuuid。`accounts.type` は既存の `user` / `org` モデル。プランは `plans.id` と `subscriptions.plan_id` で接続。
- `plans` のIDは `free`, `group`, `pro`。資料にある `account_plan_assignments` は実DBのテーブル一覧には存在しない。
- `routes.id` / `runs.id` はbigint、シーケンス採番。`account_id` と `owner_account_id` の両方が存在。
- `routes` は旧 `visibility` と新しい `is_public`、旧 `elev_profile` と新しい `elevation_profile` が併存。
- 独自enum: `route_origin = drawn, imported, from_log`、`run_mode = free, follow_route`。
- publicの制約件数: 外部キー27、CHECK26、UNIQUE5、主キー16。全制約の定義比較は未実施。
- 拡張: pg_stat_statements、pgcrypto、plpgsql、supabase_vault、uuid-ossp。
- `auth.users` のINSERTトリガー `on_auth_user_created` が `handle_new_user()` を呼ぶ。
- この関数は個人accounts、public.users、freeのsubscriptionsを作成するが、新しい `account_memberships` は作成しない。
- 所有者・実走アカウントを補完する旧トリガーと、新しい写真更新日時・複製数トリガーが併存。
- Storageは `route-photos` の1バケットを確認。非公開、ファイルサイズ上限・許可MIME設定はNULL、オブジェクト84件。

## マイグレーション履歴

実DBで `to_regclass('supabase_migrations.schema_migrations')` はNULL。
**標準の適用履歴テーブルが存在しないため、適用日時・順序・ファイルの内容一致を履歴から証明できない。**
SQL Editorに保存済みクエリは存在するが、保存クエリは適用履歴の代用にはならない。

| ローカルのバージョン | 目的 | 実DBの代表的な証拠 |
| --- | --- | --- |
| 202609060001 | 開発者限定アクセス | app_developers / is_app_developerが存在 |
| 202609130001 | 写真Storageアクセス修正 | can_access_route_photo_objectが存在 |
| 202609130002 | 実走写真モデル | run_photos / route_photo_selectionsが存在 |
| 202609230001 | 標高保存 | routes.elevation_profileが存在 |
| 202609270001 | 所属・プラン機能の拡張 | account_memberships / plan_entitlementsが存在 |
| 202609270002 | 公開ルート共有 | get_public_profileと公開SELECTポリシーが存在 |
| 202609300001 | 写真順序 | route_spot_photos.sort_orderが存在 |
| 202610010001 | 複製元・複製数 | update_route_copy_countとトリガーが存在 |
| 202610030001 | 公開時のプライバシー保護 | route_private_geometriesが存在 |
| 202610040001 | 公開RPC修正 | 現行RPCにroute.id::bigintの返却処理が存在 |
| 202610100001 | マーカー | route_markersと8引数のset_route_publicationが存在 |

全11件で代表構造は確認できた。ただし後続SQLで置換された関数もあり、これは「11ファイルがそのまま順番に適用された」という証明ではない。

### 新環境へそのまま適用できない理由

1. 基本9テーブル（accounts、account_members、orgs、plans、subscriptions、users、routes、runs、route_spot_photos）のCREATE TABLEがローカルのマイグレーションにない。
2. enum、シーケンス、旧関数・トリガー・RLSなど、実DBだけに存在する初期定義がある。
3. 最初のSQLは特定メールアドレスのAuthユーザー2名を検索し、不在なら例外で停止する。空のAuth環境では実行できない。メールアドレスも環境固有データとして分離が必要。
4. 最初のSQLは `route-photos` が作成済みであることを要求し、不在なら停止する。
5. アカウント拡張SQLは既存accounts・plans・subscriptionsと `free` プランなどを前提にしている。
6. `supabase/config.toml`、seed、復元検証手順、DBデプロイのCIは存在しない。Supabase CLI / psqlも今回のシェルのPATHでは見つからなかった。
7. 調査時点で `supabase/` 全体がGit未追跡。GitHubからの再現・配布の対象になっていない。

## 公開前に修正が必要な権限

### 優先度: 最優先 — 5テーブルがRLS無効かつanonに読み書き許可

`accounts`, `account_members`, `orgs`, `plans`, `subscriptions` は全てRLS無効。
`anon` と `authenticated` の双方にSELECT / INSERT / UPDATE / DELETEなどの権限を確認。anonにはpublicスキーマのUSAGEもある。

これはDB権限上の確認結果。外部APIでの変更実験は行っていない。公開用APIキーを使うアプリ構成において、これらのテーブルを安全と扱うことはできない。

特に旧 `routes_select_owner` は、`account_members` の所属行があればルート閲覧を許可する。所属テーブルへの無制限な書き込みとの組み合わせは優先して解消する必要がある。新旧所属テーブルのどちらを権限の正とするかも統一する。

### 優先度: 高 — 旧公開条件の残存

`routes_select_public` は旧 `visibility = 'public'` による閲覧を許可し、新しい `is_public` と別経路になっている。現時点で `visibility='public' AND is_public IS NOT TRUE` は0件だが、ポリシーは残存。
新しい公開ポリシーだけを移す、または旧ポリシーをそのままコピーする、いずれも全体の意図を確認してから行う。

### 優先度: 高 — Storageの読み取り・削除条件の共用

実DBのStorage DELETEポリシーは `can_access_cycling_photo_object(name)` を使用し、この関数は公開写真も許可する。restrictive側のUSINGも同じ関数。DELETEにはWITH CHECKは適用されないため、ログインユーザーによる他者の公開写真削除を許す条件になっていないか、所有者限定の削除条件へ修正する必要がある。削除の実行検証はしていない。

### 一般ユーザー運用への切り替え

- `current_account_id()` 自体が開発者限定。ルート・実走・写真・マーカー・公開RPCにも開発者条件がある。
- 本番で開発者条件だけを外すと旧ポリシーと合成されるため、全ポリシーを整理した追加マイグレーションが必要。
- `set_route_publication`、`has_account_role` などは実DBでanonのEXECUTEがtrue。関数内の認証・所有者条件も確認し、意図するロールに実行権限を限定する。PUBLICからのREVOKEだけではロールへの直接付与は除去されない。
- 現行React画面はパスワードログインのみ。新規登録の公開手順と、Auth作成時に新所属テーブルへ行を作る処理は別途整備が必要。

## データ移行時の確認

| 項目 | 実測件数 |
| --- | ---: |
| auth.users | 4 |
| public.users | 6 |
| accounts | 7 |
| 旧account_members | 1 |
| 新account_memberships | 6 |
| routes | 51 |
| runs | 42 |
| route_spot_photos | 32 |
| run_photos | 5 |
| Auth行がないpublic.users | 2 |
| 対応accountsがないpublic.users | 0 |
| 現usersで有効owner所属がないもの | 0 |
| routes.account_idがNULL | 0 |
| routes.owner_account_idとaccount_idが不一致（NULL含む） | 1 |
| runs.account_idがNULL | 0 |
| 有効扱いのsubscriptionがないaccounts | 0 |
| plan_entitlements | 0 |
| 絶対URLをimage_urlまたはthumb_urlに持つルート写真 | 31 |

Auth行のない旧ユーザーは既存SQLにも想定の記載があり、自動削除・不正データ扱いはしない。所有ID不一致も所有者の意図を確認してから修正する。

本番に既存データを移す場合は、Auth UUIDとの対応、シーケンスの次値、Storage実ファイル、写真とプロフィールURLを含めた移行方針が必要。SQLのスキーマ複製だけでは写真実体は移らない。開発環境には原則としてテスト用データを用意する。

## 環境設定と資料の状態

- Supabase接続は `src/lib/supabase.ts` に集約され、VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEYで切り替え可能。接続先の分離は大規模改修なしで実現可能。
- `.env.local` はGit除外済み。ただし `.env.production.local` などは現在の `.gitignore` では除外されないため、新しい環境ファイルを作る前に対応する。
- PagesのWorkflowは手動実行、単一の接続変数、単一の `github-pages` 環境。DB移行工程はない。GitHub側のSecrets実値は未確認。
- `docs/account-plan-foundation-rollout.md` はaccount_plan_assignments、plan_code、account_typeなど、現SQLと違う構造を案内している。そのまま運用手順として使わない。
- `docs/current-database-inventory.md` は9月27日のソース中心調査。今回はじめて確認した実DB情報で補完が必要。
- READMEはマイグレーション3本だけを案内し、実際の11本およびメールアドレス埋め込みの現状と一致しない。

## 推奨する移行順序

1. **現DBを保全する。** DBバックアップとStorageの保存方法・復元可能性を確認。既存データを本番に引き継ぐかを決める。既存を本番として維持する案と、新規本番へ選別移行する案を比較する。
2. **実DBから初期定義を確定する。** publicの完全なDDL、独自enum・シーケンス・関数・トリガー・RLS・GRANT・デフォルト権限、auth側の独自トリガー、Storageポリシーを取得。Supabase管理スキーマ全体を独自DDLとして再作成しない。
3. **初期定義・共通データ・環境固有設定を分ける。** プラン初期値、バケット設定、テストユーザー・開発者allowlistを整理。現行状態をベースラインにするなら既存11本を重ねて再適用しない履歴設計にする。
4. **権限修正を追加SQLとして管理する。** RLS無効5テーブル、旧所属と公開条件、Storage DELETE、実行権限を整理。一般公開用ポリシーを設計し、既存SQLの書き換えで履歴を曖昧にしない。
5. **空の検証環境で再現する。** ベースライン＋追加マイグレーション＋必要seedから起動できることを確認。Auth新規作成、一般ユーザーA/B、未ログインで閲覧・作成・更新・削除の境界をテストする。
6. **開発・本番の接続と配布を分ける。** プロジェクトID、公開キー、Auth URL設定、環境ごとのビルド設定を明示。開発で検証した同じSQLを本番へ順に適用する。接続先の取り違えをチェックする。
7. **履歴管理を開始する。** ローカルとリモートのmigration listを一致させ、以後DDL変更はSQLファイルで管理。migration repairは差分を確認してから実施し、未適用変更を適用済みと偽装しない。

移行準備完了の条件は「別の空環境で再現できる」「権限テストに合格する」「データ・Auth・Storageの扱いが確定する」「接続先と履歴が環境ごとに管理できる」の4点。今回、新規プロジェクト作成・デプロイ・DB変更は実施していない。

## 保全の実施記録（2026-10-12追記）

- `backups/20261011-200612-supabase/database.dump` に全DBのpg_dumpカスタム形式を取得。終了コード0。Authユーザー、publicテーブル、Storage管理情報を含む。`pg_restore`でアーカイブを最後まで読み出せた。
- 同ディレクトリに、パスワードを除いた `roles.sql` と、`route-photos` の実ファイル84件を保存。実ファイルは合計243,687,854バイト。
- `manifest.json` と `storage-manifest.json` にサイズ・SHA-256を記録。全84件のファイルのサイズとハッシュを再計算して照合。DBアーカイブのStorage管理情報とファイル名、version、updated_atが一致。
- バックアップと接続情報は `.gitignore` 対象で、ローカルの所有者だけが読み書きできる権限を設定。接続情報の値はレポートに記載していない。
- **未実施:** 別環境への復元試験、別媒体へのコピー。DB取得と写真取得の時刻には差があるが、Storage管理情報の同一性を確認した。これで復元動作まで保証したものではない。

## 公式資料

- [環境管理](https://supabase.com/docs/guides/deployment/managing-environments)
- [マイグレーション管理](https://supabase.com/docs/guides/deployment/database-migrations)
- [既存プロジェクトとローカル開発](https://supabase.com/docs/guides/local-development/cli-workflows)

公式手順のdb pull / migration listを参考にできるが、本件では未記録の既存DDLと11本の差分があるため、履歴を整理せずにdb pushを実行しない。
