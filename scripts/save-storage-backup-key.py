#!/usr/bin/env python3
"""Save the project's existing service_role key locally for a one-time backup."""
import getpass
import os
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / '.backup-secrets' / 'storage-key'

os.umask(0o077)
target.parent.mkdir(mode=0o700, exist_ok=True)
target.parent.chmod(0o700)
key = getpass.getpass('Existing Supabase service_role key: ').strip()
if not key or '\n' in key or '\r' in key:
    raise SystemExit('キーが空、または改行を含んでいます。')
target.write_text(key)
target.chmod(0o600)
print('Git対象外のローカルファイルへ保存しました。キーは表示していません。')
