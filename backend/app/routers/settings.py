from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.services.scheduler import reschedule_digest
from app.services.settings_store import get_digest_config, set_values

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsRead(BaseModel):
    digest_hour: int
    digest_minute: int
    digest_count: int


class SettingsUpdate(BaseModel):
    digest_hour: Optional[int] = None
    digest_minute: Optional[int] = None
    digest_count: Optional[int] = None


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


@router.get("", response_model=SettingsRead)
def get_settings(session: Session = Depends(get_session)):
    return get_digest_config(session)


@router.put("", response_model=SettingsRead)
def update_settings(
    payload: SettingsUpdate, session: Session = Depends(get_session)
):
    data = payload.model_dump(exclude_unset=True)
    values: dict[str, int] = {}
    if data.get("digest_hour") is not None:
        values["digest_hour"] = _clamp(int(data["digest_hour"]), 0, 23)
    if data.get("digest_minute") is not None:
        values["digest_minute"] = _clamp(int(data["digest_minute"]), 0, 59)
    if data.get("digest_count") is not None:
        values["digest_count"] = _clamp(int(data["digest_count"]), 1, 20)
    if values:
        set_values(session, values)
        reschedule_digest()  # take effect without a restart
    return get_digest_config(session)
