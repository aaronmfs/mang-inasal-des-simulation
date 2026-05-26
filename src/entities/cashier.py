import simpy

from src.config import Config


class CashierManager:
    def __init__(self, env: simpy.Environment, config: Config) -> None:
        self.resource: simpy.Resource = simpy.Resource(
            env, capacity=config.num_cashiers
        )
        self._config = config

    def request(self) -> simpy.Request:
        return self.resource.request()

    def service_time(self) -> float:
        return self._config.cashier_service_time()
