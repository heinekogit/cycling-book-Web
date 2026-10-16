#!/usr/bin/env python3
"""Store the existing cycling-book-dev DB password in a Git-ignored pgpass file."""

import getpass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOST = "aws-0-ap-northeast-1.pooler.supabase.com"
USER = "postgres.cyutxspjthlodvgchnst"


def main() -> None:
    os.umask(0o077)
    directory = ROOT / ".backup-secrets"
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    password = getpass.getpass("cycling-book-dev の Database password: ")
    if not password or "\n" in password or "\r" in password:
        raise SystemExit("空または改行を含むパスワードは保存できません")
    escaped = password.replace("\\", "\\\\").replace(":", "\\:")
    target = directory / "dev-pgpass"
    target.write_text(f"{HOST}:5432:postgres:{USER}:{escaped}\n")
    target.chmod(0o600)
    print("開発用DBの接続情報をGit対象外のローカルファイルへ保存しました。")


if __name__ == "__main__":
    main()
