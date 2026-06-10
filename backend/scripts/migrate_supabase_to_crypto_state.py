"""
Разовый перенос: читает app_state(id='global').content из Supabase REST
и записывает в нашу таблицу crypto_app_state. Запускать ОДИН раз до переключения.

Использование (из папки backend):
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_ANON_KEY=<anon> \
  DATABASE_URL=<прод-БД beta> \
  venv/bin/python scripts/migrate_supabase_to_crypto_state.py
"""
import os
import sys
import urllib.request
import json

from app.database import SessionLocal, init_db
from app.models.crypto_app_state import CryptoAppState


def fetch_from_supabase() -> dict:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_ANON_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/app_state?id=eq.global&select=content",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read())
    if not rows:
        print("⚠️ В Supabase нет строки id=global — нечего переносить.")
        sys.exit(1)
    return rows[0]["content"]


def main():
    content = fetch_from_supabase()
    init_db()
    with SessionLocal() as db:
        row = db.query(CryptoAppState).filter(CryptoAppState.id == "global").first()
        if row:
            row.content = content
        else:
            db.add(CryptoAppState(id="global", content=content))
        db.commit()
    keys = list(content.keys()) if isinstance(content, dict) else "?"
    print(f"✅ Перенесено. Ключи документа: {keys}")


if __name__ == "__main__":
    main()
