from src.base.resource_manager import ResourceManager
from src.config import Config


class ServerManager(ResourceManager):
    def __init__(self, env, config: Config) -> None:
        super().__init__(env, config.num_servers)
        self._config = config

    def delivery_time(self) -> float:
        return self._config.server_delivery_time()
