from src.base.resource_manager import ResourceManager
from src.config import Config


class CashierManager(ResourceManager):
    def __init__(self, env, config: Config) -> None:
        super().__init__(env, config.num_cashiers)
        self._config = config

    def service_time(self) -> float:
        return self._config.cashier_service_time()
