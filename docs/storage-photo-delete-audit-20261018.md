# 3-3 Storage写真削除権限（2026-10-18）

## 判定と変更

`route-photos` バケットのDELETEには、公開写真も許可するpermissiveポリシーと、ルート／実走の所有者だけを許すrestrictiveポリシーが併存していた。PostgreSQLでは両者がANDになるため、**変更前から他人の公開写真は削除できなかった**。従来の事前調査にある「削除できる可能性」は、restrictive境界を考慮しない懸念であり、実害を確認したものではない。

ただしpermissive側の公開写真許可は意図を読み取りにくく、restrictive側への依存を増やす。`20261018000300_limit_storage_photo_delete_to_owner.sql` でpermissive側も `can_access_route_photo_object(name) OR can_access_run_photo_object(name)` に限定した。restrictive境界、写真のSELECT・INSERT・UPDATEポリシー、関数本体は変更していない。

## 実行と検証

- 開発用 `cyutxspjthlodvgchnst` と本番扱い `cqiqhczxuiyakptdjowr` の適用前履歴は5件で一致し、今回の履歴はなかった。DELETEポリシーも両方とも同じ2件だった。
- 変更前の全DBアーカイブを `backups/20261018-storage-delete/` に取得した。SHA-256は開発用 `5afb094f4b7289148e4dfc52fabd6af6dcf241a1e5e70d399e6bd670592848f9`、本番扱い `5f1ae12380516886f332fb58ce840ccb0041f22b20bcb87fea038b65a373b1be`。両アーカイブのTOCを確認した。Storage実ファイルの別バックアップは既存の保全記録を参照。
- `supabase/tests/storage_delete_two_users.sql` で、仮Authユーザー2件、公開ルート写真、実走写真を単一トランザクションに作成。変更前に両DBで、他人が公開写真を読めても削除できず、所有者は両種の写真を削除できることを確認してROLLBACKした。
- 同じトランザクション内で修正SQLを仮適用して同試験を行い、両DBで成功・ROLLBACK。開発用に一度だけ適用し、履歴 `20261018000300` を同一トランザクションで記録。適用後の試験も成功・ROLLBACK。
- 本番扱いDBも同じSQLを一度だけ適用し、履歴を記録。適用後の試験も成功・ROLLBACK。最終読み取りで両DBのpermissive DELETE条件が所有者用関数2件に限定され、履歴は各1件、仮ユーザーは0件だった。

実行用の `apply.sql` とアーカイブはGit対象外の `backups/20261018-storage-delete/` に保存。今回のSQLを両DBへ再実行しない。
