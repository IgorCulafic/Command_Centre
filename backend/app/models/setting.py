from sqlmodel import Field, SQLModel


class Setting(SQLModel, table=True):
    """A single app-level preference, stored as a string key→value pair.

    Server-side settings that must take effect live (e.g. the daily-digest send
    time) live here rather than in env vars, so they can be edited from the app.
    Values are kept as strings and parsed by the settings service."""

    key: str = Field(primary_key=True)
    value: str
