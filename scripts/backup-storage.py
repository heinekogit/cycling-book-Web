#!/usr/bin/env python3
"""Download and hash all objects from the route-photos bucket using the existing key."""
import csv
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = os.environ.get('CYCLING_BOOK_BACKUP_DIR')
BACKUP = Path(BACKUP_DIR).resolve() if BACKUP_DIR else None
BUCKET = 'route-photos'
HOST = 'aws-1-ap-northeast-1.pooler.supabase.com'
USER = 'postgres.cqiqhczxuiyakptdjowr'
BASE = 'https://cqiqhczxuiyakptdjowr.supabase.co'
PSQL = '/opt/homebrew/opt/libpq/bin/psql'


def inventory():
    env = os.environ.copy()
    env.update(PGPASSFILE=str(ROOT / '.backup-secrets' / 'pgpass'),
               PGSSLMODE='require', PGCONNECT_TIMEOUT='15')
    # New read-only inventory query. It does not replay any migration or SQL Editor query.
    sql = "select name,coalesce(metadata->>'size','') from storage.objects where bucket_id='route-photos' order by name"
    result = subprocess.run([PSQL, '-X', '-w', '-h', HOST, '-p', '5432', '-U', USER,
                             '-d', 'postgres', '--csv', '-t', '-c', sql],
                            env=env, capture_output=True, text=True, check=True)
    return [(name, int(size) if size else None) for name, size in csv.reader(result.stdout.splitlines())]


def safe_destination(name):
    parts = Path(name).parts
    if not parts or name.startswith('/') or any(part in ('', '.', '..') for part in parts):
        raise ValueError(f'Unsafe Storage object path: {name!r}')
    target = BACKUP / 'storage' / BUCKET / name
    if not target.resolve().is_relative_to((BACKUP / 'storage' / BUCKET).resolve()):
        raise ValueError(f'Unsafe Storage object path: {name!r}')
    return target


def download(name, size, key):
    target = safe_destination(name)
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f'{BASE}/storage/v1/object/authenticated/{BUCKET}/{urllib.parse.quote(name, safe="/")}'
    request = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    temp = target.with_name(target.name + '.partial')
    digest = hashlib.sha256()
    count = 0
    try:
        with urllib.request.urlopen(request, timeout=60) as source, temp.open('wb') as dest:
            while chunk := source.read(1024 * 1024):
                dest.write(chunk)
                digest.update(chunk)
                count += len(chunk)
        if size is not None and count != size:
            raise ValueError(f'Size mismatch for {name}: expected {size}, got {count}')
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return {'name': name, 'bytes': count, 'sha256': digest.hexdigest()}


def main():
    os.umask(0o077)
    if BACKUP is None or not BACKUP.is_relative_to((ROOT / 'backups').resolve()) or not (BACKUP / 'manifest.json').is_file():
        raise SystemExit('CYCLING_BOOK_BACKUP_DIR で backups/ 内の manifest.json がある保存先を指定してください。')
    key_file = ROOT / '.backup-secrets' / 'storage-key'
    if not key_file.is_file():
        raise SystemExit('Storage keyがありません。先に save-storage-backup-key.py を実行してください。')
    key = key_file.read_text().strip()
    if not key:
        raise SystemExit('Storage keyが空です。')
    before = inventory()
    print(f'Storageオブジェクト {len(before)} 件を取得します。', flush=True)
    saved = []
    for index, (name, size) in enumerate(before, 1):
        saved.append(download(name, size, key))
        if index % 10 == 0 or index == len(before):
            print(f'{index}/{len(before)} 件を保存', flush=True)
    after = inventory()
    if before != after:
        raise SystemExit('取得中にStorageの一覧またはサイズが変化しました。再照合が必要です。')
    manifest_path = BACKUP / 'storage-manifest.json'
    manifest_path.write_text(json.dumps({'bucket': BUCKET, 'object_count': len(saved),
                                         'total_bytes': sum(item['bytes'] for item in saved),
                                         'verified_at_jst': datetime.now(ZoneInfo('Asia/Tokyo')).isoformat(),
                                         'objects': saved}, ensure_ascii=False, indent=2) + '\n')
    backup_manifest = BACKUP / 'manifest.json'
    meta = json.loads(backup_manifest.read_text())
    meta['storage_files'] = {'status': 'complete', 'object_count': len(saved),
                             'total_bytes': sum(item['bytes'] for item in saved),
                             'manifest': manifest_path.name}
    backup_manifest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(f'Storage {len(saved)} 件を保存し、件数・サイズ・SHA-256を記録しました。')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as exc:
        print(f'Storage API error: HTTP {exc.code}', file=sys.stderr)
        raise SystemExit(1)
