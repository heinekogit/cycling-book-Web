# 写真保存構造

## 方針

写真の原本は、まず実走ログの記録として保存する。公開ルートへ掲載する写真は、
原本を複製せず、後から選択して関連付ける。

## テーブル

### run_photos

実走中に撮影した写真の正本。所有者、実走ログ、撮影日時、位置、Storageの
オブジェクトパスを持つ。idは端末側でも生成できるUUIDとし、オフライン後の
再送時に同じIDを使うことで重複登録を防ぐ。

### route_photo_selections

run_photosから公開・共有ルートへ採用した写真を表す中間テーブル。並び順と
キャプションを持つ。写真ファイル自体は複製しない。

### route_spot_photos

既存Web/HTMLとの互換テーブルとして維持する。run_photo_idとrun_idを
追加し、新構造から既存画面へ段階的に橋渡しできるようにする。既存31件は
自動推測で移行せず、対応関係を確認した後に別マイグレーションで紐付ける。

## Storage

bucketは既存のprivateな route-photos を継続利用する。

新規写真のパス:

    runs/{account_id}/{run_id}/{photo_id}/original.ext
    runs/{account_id}/{run_id}/{photo_id}/thumbnail.jpg

DBには公開URLではなく上記の相対パスを保存する。表示時だけ認証済みダウンロード
または短時間の署名URLを作る。

## React Native同期

端末では撮影直後にUUID、ローカルURI、撮影日時、座標、run_idを保存する。
通信復帰後、同じUUIDのStorageパスとrun_photos.idへupsertする。原本と
サムネイルのアップロードが完了してからDB行を確定し、失敗時は端末キューへ戻す。

## 段階移行

1. 新テーブルとRLSを追加する（既存データは変更しない）。
2. React Nativeの撮影・オフラインキュー・同期をrun_photosへ接続する。
3. Webの実走詳細をrun_photos優先、route_spot_photos互換読みにする。
4. 公開ルートへの写真選択をroute_photo_selectionsで実装する。
5. 既存31件を確認し、確実に対応できるものだけrun_photosへ紐付ける。
