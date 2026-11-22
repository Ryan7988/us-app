import subprocess
import sys
from pathlib import Path


def test_migrations_match_models(tmp_path: Path) -> None:
    """alembic upgrade head 後，models 與資料庫 schema 不能有差異（忘了產生 migration 會失敗）。"""
    env = {"DATABASE_URL": f"sqlite:///{tmp_path}/m.sqlite3", "PATH": ""}
    cwd = Path(__file__).resolve().parents[1]
    for args in (["upgrade", "head"], ["check"]):
        r = subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
        )
        assert r.returncode == 0, r.stderr
