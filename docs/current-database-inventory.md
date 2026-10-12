# Cycling Book 現行データ構造調査

調査日: 2026-09-27

## 目的

アカウント、プラン、グループ権限を再設計する前に、現行React実装とリポジトリ内のSupabaseマイグレーションが前提としているデータ構造を整理する。

この文書は現行実装を優先する。旧要件定義V0.1のDDLは、初期構想の参考資料としてのみ扱う。

## 調査範囲と限界

確認したもの:

- `src` 配下のSupabaseアクセスコード
- `supabase/migrations` 配下の既存マイグレーション
- `docs/react-migration-plan.md`
- 旧HTML版 `/Users/dev_tomo/Desktop/cy2`
- 旧要件定義V0.1

未確認のもの:

- 接続先Supabaseの完全なテーブル定義
- 接続先Supabase上にのみ存在する制約、トリガー、古いRLSポリシー
- 本番データ件数とNULL・孤立レコードの実態

接続先SupabaseのOpenAPIスキーマ取得は、公開キーに対して管理権限が必要な設定のため取得できなかった。したがって、型と制約はリポジトリから確認できる範囲を確定情報とし、それ以外は要照合として扱う。

## 現行の認証とアカウント

- Supabase Authの `auth.users.id` と `public.users.id` が対応する。
- Reactは `public.users.account_id` を1件取得し、ログイン中の所有主体として使う。
- 現行の `getAccountId()` は単一値を返し、複数アカウント所属を表現しない。
- DB関数 `current_account_id()` も単一の `account_id` を返す。
- 現在のRLSは `app_developers` に登録された開発者だけを許可する暫定構成である。

## アプリが参照する主要テーブル

### users

コードから確認できる列:

- `id`
- `account_id`
- `display_name`
- `profile_image`
- `home_lat`
- `home_lng`
- `home_name`

用途:

- 認証ユーザーとサービス内アカウントの対応
- 個人プロフィール
- ルート作成時の初期地図位置

### routes

コードから確認できる列:

- `id`
- `account_id`
- `owner_account_id`
- `name`
- `description`
- `created_at`
- `is_public`
- `route_type`
- `source_run_id`
- `origin`
- `distance_m`
- `geojson`
- `polyline`
- 標高プロファイル関連列

現状:

- 新規保存時は `account_id` と `owner_account_id` に同じ値を設定する。
- 一覧、更新、削除の多くは `account_id` で絞り込む。
- `owner_account_id` は将来の所有主体分離に利用できるが、現時点では権限判定の中心ではない。
- 公開範囲は `is_public` の二値である。

### runs

コードから確認できる列:

- `id`
- `account_id`
- `name`
- `started_at`
- `ended_at`
- `created_at`
- `distance_m`
- `duration_s`
- `avg_speed_kmh`
- `geojson`
- `polyline`
- 標高プロファイル関連列

現状:

- 個人の `account_id` で一覧、閲覧、更新、削除を制限する。
- 現行React版にはWeb実走記録の入口がなく、既存ログの閲覧・管理が中心である。

### route_spot_photos

コード・マイグレーションから確認できる主な列:

- `id`
- `route_id`
- `run_id`
- `run_photo_id`
- `image_url`
- `thumb_url`
- `taken_at`
- `lat`
- `lng`

現状:

- 既存写真構造との互換用途を持つ。
- ルートの所有アカウントを介してアクセスを判定する。

### run_photos

マイグレーションで確認できる列:

- `id uuid`
- `run_id bigint`
- `owner_user_id uuid`
- `account_id uuid`
- `bucket_id`
- `original_path`
- `thumbnail_path`
- `taken_at`
- 位置、ファイル属性、画像寸法、作成更新日時

現状:

- 実走ログと撮影者本人の両方に結び付く。
- RLSは `owner_user_id = auth.uid()` を要求する。
- グループに所属しているだけでは写真へアクセスできない。

### route_photo_selections

- `route_id bigint`
- `run_photo_id uuid`
- `sort_order`
- `caption`
- `selected_at`

用途:

- 個人の実走写真からルート掲載写真を選択する。
- 実走写真を個人所有のまま保ち、ルートへの掲載関係を分離できるため、将来のグループルートにも応用可能である。

## 現行RLSの特徴

- `users`、`routes`、`runs`、写真関連テーブルは開発者限定である。
- `routes` と `runs` は主に `account_id = current_account_id()` で制限する。
- `run_photos` はアカウント一致に加え、撮影者本人との一致も要求する。
- StorageのオブジェクトパスはアカウントID、ルートIDまたは実走IDを含む。
- 古いポリシーを残したまま、restrictiveポリシーで境界を狭める暫定方式が使われている。

## グループ拡張時の主要な差分

1. 1ユーザーが複数の所有主体に所属できない。
2. 操作対象となるアカウントを選ぶ概念がない。
3. 所属ロールを保存・判定する構造がない。
4. `routes.owner_account_id` と実際のAPI・RLS判定が統一されていない。
5. 公開範囲が公開・非公開の二値に限定されている。
6. プラン、契約状態、機能権限、利用上限が存在しない。
7. 開発者限定RLSから一般利用向けRLSへの移行が必要である。

## 維持すべき現行資産

- Supabase Authと `public.users` の対応
- 既存の `account_id`
- `routes.owner_account_id`
- 個人実走ログの構造
- 実走写真とルート掲載写真を分ける構造
- Storageパスに所有者を含める方針
- React側のSupabaseクライアント集約

## 実DB照合時の確認項目

- 全テーブルの列型と既定値
- `users.account_id`、`routes.account_id`、`routes.owner_account_id` の型一致
- `routes.owner_account_id` のNULL件数と `account_id` 不一致件数
- `runs.account_id` と `run_photos.account_id` の整合性
- 既存外部キー、CHECK制約、トリガー
- 有効な全RLSポリシー
- 古い permissive policy の残存
- Storageバケットの公開状態と全ポリシー
- 孤立した写真およびStorageオブジェクト

## 結論

現行実装は、個人に固定された単一 `account_id` を中心に成立している。一方で、`owner_account_id` と写真選択の分離構造があるため、全面再構築ではなく段階的な拡張が可能である。

最初に行うべき変更はグループ画面の追加ではない。所有主体、所属、ロール、プラン判定の入口を追加し、既存個人ユーザーが従来どおり利用できる互換経路を確保することである。
