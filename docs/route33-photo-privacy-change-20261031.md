# ルート33の既存写真を非公開にした記録（2026-10-31）

利用者が有効な11:06写真の継続公開を望まず、11:02の削除済み扱い写真も再公開しないと決めたため、本番扱いSupabase `cqiqhczxuiyakptdjowr` の**ルート33の写真2行だけ**を非公開にした。ルート自体は公開のまま。写真ファイル・DB行は削除していない。

## 変更前と保全

- ルート33は公開中。`route_spot_photos`は2行で、11:02写真は`deleted_at`設定済み、11:06写真は有効。両行の`is_privacy_hidden`は`false`。旧RLSでは匿名から2行が見え、本番Web写真ページも2枚と表示した。
- `route-photos`は非公開Storageバケット。両元画像オブジェクトは存在し、匿名RLSから`storage.objects`の該当行は0件だった。
- 直前の全DBをGit対象外の`backups/20261031-hide-route33-photos/before.dump`へ`pg_dump -Fc`で保全。サイズ1,344,199バイト、SHA-256 `3e13c753f2d0da003466c065997d602720b18da8ea60762aa246a2cefa3c62f8`。`pg_restore -l`でアーカイブ目録を最後まで読めた。Storageファイル本体は今回変更していない。

## 実行と結果

- ローカルのGit対象外`backups/20261031-hide-route33-photos/dry-run.sql`を本番DBの単一トランザクションで一度実行。対象2行の`is_privacy_hidden=true`へ仮更新後、匿名ロールで0行を検証し、`ROLLBACK`を確認した。
- 同じ事前条件と匿名0行の検証を含む`apply-once.sql`を**一度だけ**実行し、`COMMIT`成功。適用済みSQLは再実行しない。Supabaseマイグレーション履歴は変更していない。
- 適用後の読み取り専用照合でルート33は公開、写真2行とも`is_privacy_hidden=true`、匿名ロールと所有者以外を模した認証ロールの写真行は各0件。未ログインの[本番写真ページ](https://heinekogit.github.io/cycling-book-Web/routes/33/photos)も「0枚」と表示した。

## 維持条件

現行の`set_route_publication` RPCは、ルートの公開・非公開を切り替えると写真の`is_privacy_hidden`を再計算・解除する。**写真公開選択マイグレーションと新Webの本番反映が済むまでは、ルート33の公開状態を切り替えない。** 切替時には有効・削除済みの両写真が非公開のままであることを再確認する。新仕様は既存写真の`is_publicly_selected=false`を初期値とするので、本人が明示して選ばない限り公開されない。

既に発行された署名付きURLや閲覧者側のキャッシュを回収することはできない。今回確認したのは新しい匿名アクセスと公開画面の状態。DBバックアップは復旧用であり、写真を公開へ戻すためには使わない。
