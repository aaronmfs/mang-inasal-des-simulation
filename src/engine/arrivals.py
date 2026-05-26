import random

import simpy

from src.config import Config
from src.entities.customer import Customer
from src.entities.cashier import CashierManager
from src.entities.kitchen import KitchenManager
from src.entities.dining import TableManager
from src.metrics import Metrics
from src.engine.lifecycle import customer_lifecycle


def arrival_generator(
    env: simpy.Environment,
    config: Config,
    cashier_mgr: CashierManager,
    kitchen_mgr: KitchenManager,
    table_mgr: TableManager,
    metrics: Metrics,
) -> None:
    while True:
        rate = config.peak_arrival_rate if config.is_peak_hour(env.now) \
               else config.regular_arrival_rate
        inter_arrival = random.expovariate(rate)
        yield env.timeout(inter_arrival)

        items = config.generate_order()
        customer = Customer(env.now, items)
        env.process(customer_lifecycle(
            env, config, customer, cashier_mgr, kitchen_mgr,
            table_mgr, metrics
        ))
