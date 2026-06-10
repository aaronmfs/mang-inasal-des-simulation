import random

import simpy

from src.config import Config
from src.entities.customer import Customer
from src.metrics import Metrics
from src.engine.lifecycle import customer_lifecycle


def arrival_generator(
    env: simpy.Environment,
    config: Config,
    resources: dict,
    metrics: Metrics,
) -> None:
    while True:
        rate = config.peak_arrival_rate if config.is_peak_hour(env.now) \
               else config.regular_arrival_rate
        inter_arrival = random.expovariate(rate)
        yield env.timeout(inter_arrival)

        if config.feature_kiosk:
            customer = Customer(env.now, [], config)
            if config.feature_manual_override and random.random() < config.manual_override_probability:
                customer.manual_override = True
        else:
            items = config.generate_order()
            customer = Customer(env.now, items, config)

        env.process(customer_lifecycle(
            env, config, customer, resources, metrics
        ))
