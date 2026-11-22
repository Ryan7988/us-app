"""輸出 OpenAPI schema，給前端 openapi-typescript 產生型別：
uv run python -m app.export_openapi ../web/src/api/openapi.json
"""

import json
import sys
from pathlib import Path

from app.main import app


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
