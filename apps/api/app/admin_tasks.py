"""維運指令（在 api 容器裡執行）：
python -m app.admin_tasks reset-gacha-month   # 重設本月扭蛋（make gacha-reset）
"""

import sys

from sqlmodel import Session

from app.core.db import engine
from app.services.gacha import draw_lock, get_or_create_current, reset_period


def reset_gacha_month() -> None:
    with draw_lock, Session(engine) as session:
        d = get_or_create_current(session)
        before = f"{d.period} 狀態={d.status} 卡片={d.card_content!r} 重抽次數={d.reroll_count}"
        reset_period(session, d)
        print(f"已重設：{before}")
        print("現在是「等待開獎」：兩個人都按「準備好了」就會重新開獎，重抽次數已歸零。")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "reset-gacha-month":
        reset_gacha_month()
    else:
        print(__doc__)
        sys.exit(1)
