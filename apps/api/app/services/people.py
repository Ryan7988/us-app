from sqlmodel import Session, select

from app.models import User


def partner_of(session: Session, user_id: str) -> User | None:
    return session.exec(select(User).where(User.id != user_id)).first()


def partner_id(session: Session, user_id: str) -> str | None:
    p = partner_of(session, user_id)
    return p.id if p else None
