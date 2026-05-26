import simpy

from src.config import Config


class TableManager:
    def __init__(self, env: simpy.Environment, config: Config) -> None:
        self.resource: simpy.Resource = simpy.Resource(
            env, capacity=config.num_tables
        )
        self._config = config

    def request(self) -> simpy.Request:
        return self.resource.request()

    def dining_time(self) -> float:
        return self._config.dining_time()
