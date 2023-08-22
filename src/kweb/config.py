from __future__ import annotations

from pathlib import Path

import pydantic

if int(pydantic.__version__.split(".")[0]) >= 2:
    import pydantic.v1 as pydantic  # type: ignore[no-redef]

# if int(pydantic.__version__.split(".")[0]) >= 2:
#     from pydantic_settings import BaseSettings, SettingsConfigDict

#     class Config(BaseSettings):
#        model_config = SettingsConfigDict(
#            env_prefix="kweb_", env_nested_delimiter="_"
#        )
#         fileslocation: Path

#         @pydantic.field_validator("fileslocation")
#         @classmethod
#         def resolvefileslocation(cls, v: Path | str) -> Path:
#             return Path(v).expanduser().resolve()

# else:
#     from pydantic import BaseSettings  # type: ignore[no-redef]


class Config(pydantic.BaseSettings):  # type: ignore[valid-type, misc]
    class Config:
        env_prefix = "kweb_"
        env_nested_delimiter = "_"

    fileslocation: Path

    @pydantic.validator("fileslocation")
    @classmethod
    def resolvefileslocation(cls, v: Path | str) -> Path:
        return Path(v).expanduser().resolve()
