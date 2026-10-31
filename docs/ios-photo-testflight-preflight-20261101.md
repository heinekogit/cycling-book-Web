# iOS写真表示のTestFlight事前確認（2026-11-01）

対象はiOSリポジトリの[Draft PR #1](https://github.com/heinekogit/cycling-book-app/pull/1)、ブランチ`fix/photo-public-display-20261031`、コミット`fa41e79`。変更は`src/lib/route-photos.ts`の写真ごとの公開コピー選択と削除済み写真除外。利用者のiOS作業ツリーには未コミットのメモ変更があるため、編集・コミットに含めない。

確認済み:

- `npm run typecheck`、`npm run lint`、`npm test`（33件）成功。
- 本番WebのGit対象外`.env.production.local`からSupabase URLとpublishable keyを一時環境変数に設定し、`EXPO_NO_DOTENV=1`でiOSバンドルを生成。バンドルに本番プロジェクト`cqiqhczxuiyakptdjowr`が含まれ、開発プロジェクト`cyutxspjthlodvgchnst`は含まれない。
- 同じ環境で署名なしのiOS Simulator向けReleaseネイティブビルドが成功。生成された`CyclingBook.app/main.jsbundle`でも本番プロジェクト参照あり、開発プロジェクト参照なしを確認。これは**TestFlight配布用の署名済みIPAではない**。

TestFlightアップロード前の未完了:

1. App Store Connectへログインし、`com.dotblotworks.cyclingbook`のアプリ登録と配布権限を確認する。ChromeのApp Store Connectはログイン画面の読み込み中から進まず、Safariでの確認を依頼中。
2. このMacのKeychainで`security find-identity -v -p codesigning`は有効な署名IDを0件と報告。Apple Developerの配布署名とプロビジョニングを用意する。
3. 本番接続先を固定した署名済みiOSアーカイブを作り、App Store ConnectへアップロードしてTestFlight処理完了を確認する。ローカルの`.env.local`は開発用なので、そのまま配布ビルドに使用しない。
4. iPhoneでTestFlight版にログインし、ルート33の所有者の未選択写真は見えること、他ユーザーには見えないこと、公開選択された開発用写真だけが公開用コピーで見えることを確認する。ルート33の本番写真は非公開のまま維持する。

Draft PR #1はTestFlight確認前に`main`へマージしない。
