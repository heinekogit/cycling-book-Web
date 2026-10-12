# アカウント・プラン基盤 導入手順

対象マイグレーション:

`supabase/migrations/202609270001_account_plan_foundation.sql`

## 今回追加するもの

- 個人・グループを表す `accounts`
- ユーザーの所属とロールを表す `account_memberships`
- 3つの基本プランを表す `plans`
- 機能・上限を表す `plan_entitlements`
- アカウントへのプラン割当を表す `account_plan_assignments`
- 所属ロールを確認する `has_account_role()`
- Reactの `AccountProvider`
- 新テーブル未適用時の旧 `users.account_id` フォールバック

## 変更しないもの

- `users`、`routes`、`runs` の既存列
- 既存ルート、実走、写真データ
- 既存テーブルのRLS
- Storageポリシー
- ルートの所有判定
- 課金処理

## 適用前確認

マイグレーションは `public.users.account_id` が `uuid` でない場合、トランザクションの最初で停止する。停止時はDBを変更しない。

Supabase SQL Editorで次を確認する。

```sql
select
  table_name,
  column_name,
  data_type,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'routes', 'runs')
  and column_name in ('id', 'account_id', 'owner_account_id')
order by table_name, ordinal_position;
```

## 適用後確認

```sql
select account_type, count(*) from public.accounts group by account_type;
select role, status, count(*) from public.account_memberships group by role, status;
select code, account_type, display_name from public.plans order by code;
select plan_code, status, count(*) from public.account_plan_assignments group by plan_code, status;

select count(*) as users_without_personal_account
from public.users legacy
left join public.accounts account on account.id = legacy.account_id
where legacy.account_id is not null
  and account.id is null;

select count(*) as users_without_owner_membership
from public.users legacy
left join public.account_memberships membership
  on membership.account_id = legacy.account_id
 and membership.user_id = legacy.id
 and membership.role = 'owner'
 and membership.status = 'active'
where legacy.account_id is not null
  and membership.user_id is null;
```

両方の不足件数が0であることを確認する。

## React側の互換動作

新テーブルがまだ存在しない、または参照できない場合、`AccountProvider` は従来の `users.account_id` を個人フリーとして扱う。

新テーブル適用後は、所属アカウント一覧、ロール、現在のプランを読み込む。所属が1件の間は画面にアカウント切替を表示しない。

## 次段階へ進む条件

- 個人ユーザーのマイページ、ルート、実走ログが従来どおり表示される
- ログアウト・再ログイン後も個人アカウントが選択される
- 上記の不足件数が0である
- 新テーブルのRLSで他ユーザーの所属・プラン割当を取得できない

条件を満たした後、ルート所有判定を `owner_account_id` へ移す第2段階へ進む。
