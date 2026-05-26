import simpy

from src.config import Config
from src.entities.customer import Customer


class KitchenManager:
    def __init__(self, env: simpy.Environment, config: Config) -> None:
        self.resource: simpy.Resource = simpy.Resource(
            env, capacity=config.kitchen_capacity
        )
        self._config = config

    def request(self) -> simpy.Request:
        return self.resource.request()

    def prep_time(self, now: float, customer: Customer) -> float:
        base = self._config.kitchen_prep_time(now)
        if customer.has_bottleneck_item:
            base += self._config.bottleneck_extra_time()
        return base
