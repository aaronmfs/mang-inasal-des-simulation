from src.base.resource_manager import ResourceManager
from src.config import Config


class KioskManager(ResourceManager):
    def __init__(self, env, config: Config) -> None:
        super().__init__(env, config.num_kiosks)
        self._config = config

    def order_time(self) -> float:
        return self._config.kiosk_order_time()
