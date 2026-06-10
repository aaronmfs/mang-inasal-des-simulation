from collections.abc import Callable, Generator

from simpy.events import Event

StageFunc = Callable[..., Generator[Event, None, bool]]

BUILTIN_STAGES: dict[str, StageFunc] = {}
EXPERIMENTAL_STAGES: dict[str, StageFunc] = {}
