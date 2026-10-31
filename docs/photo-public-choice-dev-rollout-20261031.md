# 6-4 写真公開選択の開発版検証（2026-10-31）

対象は開発用Supabase `cyutxspjthlodvgchnst` と開発版Web `https://heinekogit.github.io/cycling-book-web-dev/`。本番扱いSupabase `cqiqhczxuiyakptdjowr` と本番Webには、この変更を適用していない。

## 適用と検証

- 適用前に開発DBの最新履歴が `20261025000100` で、新しい `is_publicly_selected` 列がないことを読み取り専用で確認。Git対象外の `backups/20261031-public-photo-dev/before.dump` に全DBバックアップを取得した（SHA-256 `0d274cdf2dd170b13baf2619abc604829efae1164378ac0ffd7515323ae77484`）。
- `supabase/migrations/20261025000200_public_photo_choice.sql` を開発DBで一度、ROLLBACK付きで構文・対象確認。その後、接続先・直前履歴・列の未存在を検査し、SQLと履歴登録を同一トランザクションで一度だけコミットした。再実行していない。履歴 `20261025000200` を確認した。
- `supabase/tests/public_photo_access.sql` を適用前・適用後に実行し、いずれも末尾のROLLBACKを確認した。合成の所有者・別ユーザー・匿名ロールで、所有者は元画像2件と公開コピーを読める一方、別ユーザーと匿名は公開選択した写真1件とその公開コピーのみを読めた。500m除外フラグを立てた場合とルートを非公開にした場合は匿名取得が0件になった。合成ユーザー・DB行・Storage行は残していない。
- Webソースコミット `8152a4c` は `develop`。開発Pagesコミット `5af39a9`、[Actions実行 41198702428](https://github.com/heinekogit/cycling-book-web-dev/actions/runs/41198702428)、デプロイ `7458219892` は成功。`npm run lint`、`npm run build`、`npm run check:pages -- development 5af39a9` を通し、HTTPS・SPA fallback・開発Supabase接続を確認した。
- 開発版の非公開ルートID `4`に残っていた合成PNGは初期値で非公開。公開対象に選ぶと別のJPEGコピーがStorageにでき、ルートを非公開にしたり選択を解除したりするとコピーが消えた。
- 仮ホーム地点（35.682, 139.730）から約132mのルートを500m除外ONで一時公開。選択済み写真でも匿名RESTで写真0件、元画像・公開コピーのStorage取得は拒否された。500m除外OFFで写真未選択のまま一時公開すると、匿名RESTで写真0件。選択後は写真1件、公開コピーの匿名取得HTTP 200、元画像の取得はHTTP 400（Storage応答の内部コードは `NoSuchKey`）。所有者の公開表示は選択した1枚だけ、元の表示は全写真を示した。
- 追加試験として、`Exif` セグメントと架空の `SyntheticExif` タグを含む64×64pxの合成JPEGをWeb画面から既存マーカーへ追加。公開ルート上でも新規写真は初期値で非公開。これだけを公開選択したとき、匿名から取得した公開用JPEGは1,032バイトで、`Exif` セグメントも合成タグも含まなかった。元ファイルには両方含まれていた。もう1枚の非選択写真は匿名RESTに現れなかった。
- 終了時にルートID `4`を非公開へ戻し、新規EXIF試験写真を削除。仮ホーム地点も空欄に戻し、再読み込みで空欄を確認。DBでルート非公開、写真行1件（以前からの合成PNG）、公開選択0件、公開用Storageコピー0件、マーカー元画像1件を確認した。

## 残る公開前作業

1. 本番DB・Webへの同一マイグレーションとコードの反映は、別途リリース手順で行う。旧版Webは新列を読まないが、DB適用後は従来の公開写真が初期値で非公開になるため、公開写真の表示変化と利用者への案内を先に確認する。
2. iOS公開候補で公開画像の見え方を確認する。iOSの読み込み処理と既存公開写真1枚への影響は `photo-public-ios-and-legacy-review-20261031.md` に記録した。Webのブラウザ変換は今回Chromeで実測した。Safariと画像形式ごとの再描画は未確認。
3. 公開用画像を解除するとStorageオブジェクトは削除されるが、既に取得された画像やキャッシュを回収することはできない。署名付きURLは現在1時間で、即時の閲覧不能を保証する文言は避ける。Supabaseは[認証付きStorage応答のキャッシュ](https://supabase.com/kb/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout)に注意を促している。
4. 写真を含むルート・実走・アカウント全体の削除とStorageオブジェクトの整合は6-6で扱う。利用規約・プライバシーポリシーの確定、お問い合わせ窓口も別途必要。

したがって、**6-4は開発版での実装・試験まで進み、本番反映と公開文書の確定待ち**。完了とはしない。
