# 2ユーザー・匿名RLS検証（2026-10-13）

## 対象と実行方法

既存の異なる個人アカウントを持つAuthユーザー2名をA/Bとして使用した。パスワードは使用せず、管理接続で仮行を挿入してから `SET LOCAL ROLE authenticated` とJWT claimを切り替えた。試験SQLは `supabase/tests/two_user_rls.sql`。固定の負のIDとUUIDを使い、最後に `ROLLBACK` した。途中エラーでも接続終了で未コミットの仮行は取り消される。

## 結果

- Aは自分の非公開・公開ルート、実走、ルート写真、実走写真、私有形状、写真選択を閲覧できた。Bは自分の非公開ルート・実走とAの公開ルート、公開かつ非表示でない写真・マーカー・Storageオブジェクトだけを閲覧できた。
- BからAの非公開ルート・実走・写真・私有形状・写真選択は見えなかった。公開ルート上の非表示写真・マーカーも見えなかった。
- BによるAのルート・実走・ルート写真・実走写真・公開Storage写真の更新・削除は0件。Aのアカウントを偽装したルート追加、Aのルートへの写真・マーカー追加、Aの実走への写真追加、Aの実走写真の流用、Aのルート公開RPCも拒否された。
- B自身のルート・実走・ルート写真・マーカー・実走写真の追加・更新・削除は成功した。
- 匿名ユーザーはAの公開ルート、公開写真、公開Storageオブジェクトだけ閲覧できた。記録の作成権限はなく、実走テーブルはSELECT権限もない。
- 最終実行は終了コード0・`ROLLBACK`。再照合で仮ルート・実走・写真・Storage行はすべて0件。

## 権限監査と補正

`account_memberships` と `plan_entitlements` はRLSでSELECTのみ許可していたが、テーブルACLにはログインユーザーの全操作権限が残っていた。変更前に `backups/20261013-before-membership-grants/database.dump` を取得し、`pg_restore -l` で確認した。SHA-256は `35b5bb7804d558773e12edcc32abfcbd75c2109754c7771c00ca1a0575bb1895`。バックアップはGit対象外。

`202610130001_membership_read_only_grants.sql` をロールバック付きで検証後、本DBへ一度だけ適用した。両テーブルのクライアント権限はログインユーザーのSELECTのみとなり、`has_account_role(uuid,text[])` の匿名実行権限も取り消した。一般ユーザーの所属・アカウント閲覧は継続して成功した。移行SQLのSHA-256は `e0f91a23ef9dd7162bf5d3ac80be1190cabfe257e39fbc64ccbf718b0f16b8d7`。補正後に全RLS試験を再実行して合格。

旧ポリシーは `routes` に9件、`runs` に7件残る。`routes_select_public` は旧 `visibility` を参照するが、新しいrestrictive SELECT境界が `is_public` または本人所有を必須にしている。Storageの古いpermissive DELETE条件には公開写真の判定が残るが、restrictive DELETE境界が所有者条件を必須にしている。今回のA/B/匿名試験では越境を確認しなかった。旧ポリシーの削除・整理は別の移行で実施する。

アプリが直接呼ぶ `delete_my_empty_account()` と `set_route_publication(...)` は認証済みのみ、`get_public_profile(uuid)` は公開プロフィール表示のため匿名・認証済みの両方に実行権限がある。複数の内部判定・旧トリガー関数には匿名のEXECUTEが残る。旧ポリシーとの依存を除去した後、不要な直接実行権限を縮小する余地がある。

## 範囲の限界

本試験はDB権限とRLSのSQLレベル検証。ブラウザ2セッションの操作、Storage APIによる実ファイル削除、全既存データに対する網羅的な検証ではない。仮データ以外の既存行は変更していない。
