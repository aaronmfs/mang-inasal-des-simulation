from src.base.resource_manager import ResourceManager
from src.config import Config
from src.entities.customer import Customer


class KitchenManager(ResourceManager):
    def __init__(self, env, config: Config) -> None:
        super().__init__(env, config.kitchen_capacity)
        self._config = config

    def prep_time(self, now: float, customer: Customer) -> float:
        base = self._config.kitchen_prep_time(now)
        if customer.has_bottleneck_item:
            base += self._config.bottleneck_extra_time()
        return base
