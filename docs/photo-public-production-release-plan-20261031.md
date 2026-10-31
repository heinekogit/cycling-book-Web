# 6-4 写真公開変更の本番切替準備（2026-10-31）

本書は**準備と順序**の記録。写真公開選択のSQLは開発DBにだけ適用済み。本番扱いSupabase `cqiqhczxuiyakptdjowr`には、利用者の決定に基づきルート33の既存写真2行を`is_privacy_hidden=true`にする限定変更を2026-10-31に適用した（`route33-photo-privacy-change-20261031.md`）。本番WebとiOS公開ビルド、マイグレーション履歴は未変更。

**同日追加:** 本番向けWeb候補を`release/photo-public-choice`に隔離し、[Draft PR #2](https://github.com/heinekogit/cycling-book-Web/pull/2)を作成。写真公開選択と削除済み写真除外だけを、既に本番mainへ取り込まれた無料枠変更の上に載せた。競合した2画面を解消し、公開プレビューが元画像へリンクしないよう補完した。最新mainを取り込んだ候補は`ce8663b`。`npm ci --offline`、`npm run build`、`npm run lint`は成功し、PRの`verify`も成功。本番DBでは予定SQLと合成2ユーザー・匿名試験を単一トランザクションで実行し、`ROLLBACK`を確認した。再照合で履歴`20261025000200`なし、新列なし、ルート33の写真2行とも非公開のまま。本番適用・PRマージ・Pagesデプロイは未実施。

## 現状と影響

- 本番DBの最終履歴は `20261025000100`。`is_publicly_selected` 列はまだない。予定SQLは `supabase/migrations/20261025000200_public_photo_choice.sql`。開発DBでは一度適用し、2ユーザー＋匿名RLSとWeb操作を確認済み。再適用しない。
- 本番の公開ルートは5件。[ルート33「井の頭公園まで」の写真ページ](https://heinekogit.github.io/cycling-book-Web/routes/33/photos)に写真行が2件あり、**11:06撮影の1件が有効、11:02撮影の1件は`deleted_at`設定済み**。変更前は匿名RLSに両行が見え、本番Webも2枚と表示した。2026-10-31の限定変更後は両行とも匿名RLSから消え、未ログイン画面は0枚。両方の元画像オブジェクトはStorageに残っている。
- 利用者は11:06の有効写真も非公開を選択した。新SQLでは旧写真の公開選択はすべて初期値`false`になり、匿名・他ユーザーには0件となる。元画像は所有者に残し、両方とも選び直さない。11:02の削除済み写真も再公開しない。
- Web `develop`には本番ソース`main`より多数の差分がある。写真実装コミット`8152a4c`を単独で取り込むと`RouteDetailPage.tsx`と`RoutePhotosPage.tsx`で競合したが、隔離した本番候補で解消した。`develop`全体はマージしない。候補の差分と依存関係はDraft PR #2で確認できる。
- iOSは[Draft PR #1](https://github.com/heinekogit/cycling-book-app/pull/1)で、公開選択済み写真に公開用画像を使い、削除済み写真を除外する。開発DB・シミュレータ試験済み。新しいDB列を読むため、マイグレーション前の本番接続ビルドには入れない。
- Webの削除済み写真除外はソース`develop`の`2427eba`。開発Pages `5f04505`、[Actions 41204431227](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/41204431227)、デプロイ `7459042102` は成功。`npm run check:pages -- development 5f04505`でHTTPS・SPA・開発Supabase参照を確認した。

## 本番切替の順序

1. **公開候補を固定:** Web候補はDraft PR #2として作成済み。差分と依存関係、iOS Draft PR #1の差分・TestFlight用設定を確認する。ルート33の両写真は非公開を維持し、公開フラグを一括付与しない。現行RPCは公開状態の切替で写真の非公開フラグを解除し得るため、新SQL適用前にルート33を再公開・非公開へ切り替えない。
2. **変更直前の保全:** 本番DBの新しい`pg_dump -Fc`、AuthとStorage管理情報、Storage写真ファイルのバックアップを取得し、SHA-256と`pg_restore -l`を確認する。現行Pages成功SHA・Actions実行・デプロイIDを記録する。接続先プロジェクトIDと最終履歴が上記どおりか照合する。
3. **本番SQLの事前検証:** 予定SQLのハッシュが開発DBで検証したファイルと同じことを確認。DB接続先を再確認し、単一トランザクションでSQLと合成2ユーザー・匿名試験を実行してROLLBACKを確認する。既に履歴または列が存在する場合は止め、適用済みSQLを再実行しない。
4. **本番DBへ一度だけ適用:** 前段のゲートが通った場合だけ、`20261025000200`を一回適用し、同じトランザクションで履歴登録する。直後に列・関数・RLS・Storageポリシー・履歴を読み取り専用で照合する。ルート33の既存写真は引き続き0枚を維持する。
5. **Webを公開:** レビュー済み本番向けPRをマージし、Pages Actionsとデプロイ成功を確認。`npm run check:pages -- production <成功SHA>`、HTTPS、ログイン、所有者の元画像、匿名で写真0件、削除済み写真が写真一覧に出ないことを確認する。旧Webへ戻すと新DBに合わない可能性があるため、切り戻し用の互換ビルドも先に確認する。
6. **写真の非公開を確認:** ルート33の写真は選び直さず、匿名では0枚を維持する。元画像と削除済み写真を新規に取得できないことを確認する。過去に保存された画像やキャッシュは回収できない。
7. **iOS公開候補:** 新DB列とWeb公開の検証後にiOS Draft PR #1を取り込み、TestFlightで本番接続・所有者の写真・公開コピー表示を実機確認する。審査・一般公開は別ゲート。

SQLやPagesの切り戻しは`db-migration-workflow-20261017.md`と`web-deploy-rollback-runbook-20261018.md`に従う。写真の旧公開状態へのSQL巻き戻しは元画像を再公開し得るため、障害時はまずWebの前進修正か公開停止を選ぶ。DBバックアップ復元は障害復旧の最終手段で、通常の画面切り戻しと混同しない。
