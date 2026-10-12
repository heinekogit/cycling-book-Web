#!/usr/bin/env python3
"""Store existing backup credentials locally, without echoing them or changing Supabase."""
import getpass
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOST = 'aws-1-ap-northeast-1.pooler.supabase.com'
USER = 'postgres.cqiqhczxuiyakptdjowr'


def main():
    os.umask(0o077)
    directory = ROOT / '.backup-secrets'
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    print('現在のSupabase Database passwordを入力してください。入力は表示されません。')
    password = getpass.getpass('Database password: ')
    if not password or '\n' in password or '\r' in password:
        raise SystemExit('空、または改行を含むパスワードは保存できません。')
    escaped = password.replace('\\', '\\\\').replace(':', '\\:')
    target = directory / 'pgpass'
    target.write_text(f'{HOST}:5432:postgres:{USER}:{escaped}\n')
    target.chmod(0o600)
    print('DB接続情報をGit対象外のローカルファイルへ保存しました。')
    print('写真も保存する場合、既存service_roleキーを入力してください。後で入力する場合はEnter。')
    key = getpass.getpass('Existing service_role key (optional): ').strip()
    if key:
        if '\n' in key or '\r' in key:
            raise SystemExit('キーに改行は使用できません。')
        target = directory / 'storage-key'
        target.write_text(key)
        target.chmod(0o600)
        print('Storage取得用キーを保存しました。')
    print('準備完了。チャットには「入力した」とだけお知らせください。')


if __name__ == '__main__':
    main()
