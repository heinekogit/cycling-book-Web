# RPC・内部関数の実行権限監査（2026-10-18）

## 対象と判断

Webコードが直接呼ぶRPCは `set_route_publication`、`get_public_profile`、`delete_my_empty_account`。これらの権限は変更しない。RLS・Storageポリシーが参照する判定関数も今回の変更対象外とした。

アプリDBにはトリガー専用関数6件があり、`handle_new_user()` は既に匿名・認証済みロールへの直接実行権限がない。残り5件は匿名・認証済みロールにEXECUTEが付いていたため、`supabase/migrations/20261018000200_limit_internal_function_execute.sql` でこれを取り消す。旧所属参照関数 `current_user_account_id()` は匿名・PUBLICからEXECUTEを取り消すが、現行のルート・実走INSERTトリガーが呼ぶため認証済みロールのEXECUTEは残す。`service_role` と関数所有者の権限も維持する。

## 開発用DBに適用済み

変更前バックアップはGit対象外の `backups/20261018-function-execute/dev-before.dump`。SHA-256は `303c791248d2dedb83723a936c6a23b20aad2ef13d468e1432598a91769b398b`、TOC確認済み。

単一トランザクションで権限縮小後に仮Authユーザー2件を作り、ルート・実走の作成・更新・削除、本人／他人／匿名のRLSと写真関連の境界を試験した。終了コード0・ROLLBACK。その後、開発用DBにSQLを一度適用し、履歴 `20261018000200` を同一トランザクションで登録した。適用後に同じ2ユーザー試験は終了コード0・ROLLBACK。匿名は `current_user_account_id()` とトリガー専用関数を直接実行できず、認証済みロールはトリガー経由のINSERTに必要な同関数を実行できることを読み取りで確認した。直接RPC `set_route_publication` は認証済みロールの権限を維持し、匿名の `get_public_profile` API呼び出しも成功した。仮Authユーザーは0件。

## 本番扱いDBにも適用済み

変更前バックアップ `backups/20261018-function-execute/prod-before.dump` のSHA-256は `2eb9bd34e2bf2c9f36973370f352f50a782cfe22df184458139a39707a02e140`。TOC確認済み。読み取りでは前の履歴 `20261018000100` が1件、今回の履歴0件、対象権限が変更前の状態と一致した。

初回の本番ROLLBACK付き試験は自動承認審査で拒否された。今回の依頼だけでは本番のEXECUTE権限境界変更の明示承認にならないとの理由。その後、ユーザーが「本番で試験・適用してよい」と承認した。

バックアップSHA-256、前の履歴1件・今回の履歴0件、変更前権限を再確認。本番のROLLBACK付き2ユーザー試験は終了コード0・`ROLLBACK`、試験後も権限は変更前、仮Authユーザー0件だった。同じSQLを本番DBへ一度だけ適用し、履歴 `20261018000200` を同一トランザクションで登録した。適用後の2ユーザー試験も終了コード0・`ROLLBACK`。匿名の旧所属参照・トリガー専用関数EXECUTEは無効、認証済みのルート保存に必要な旧所属参照と `set_route_publication` RPC権限は維持。仮Authユーザーは0件。匿名APIの `get_public_profile` と公開ルート3件の読み取りも成功した。

**このSQLは開発用・本番用の両DBへ適用済み。再実行しない。** 試験・適用ログはGit対象外の同じバックアップディレクトリに保存した。

## ログイン済みAPI検証

保存済みの開発用テストパスワードによるAuth APIログインは `Invalid login credentials`。ユーザーの存在、確認済みメール、認証identity 1件は読み取りで確認した。パスワードは再試行・表示・変更していない。ログイン済みWeb/APIの確認は、ユーザーが現在のパスワードでログインできる状態にしてから行う。
