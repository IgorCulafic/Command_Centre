"""Top-level seed entry point — delegates to services.seed."""

from app.services.seed import run_seed

__all__ = ["run_seed"]
