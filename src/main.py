import random

import simpy

from src.config import Config
from src.entities.cashier import CashierManager
from src.entities.kitchen import KitchenManager
from src.entities.dining import TableManager
from src.engine.arrivals import arrival_generator
from src.engine.monitor import monitor_process
from src.metrics import Metrics


def main() -> None:
    config = Config()
    random.seed(config.random_seed)

    env = simpy.Environment()

    cashier_mgr = CashierManager(env, config)
    kitchen_mgr = KitchenManager(env, config)
    table_mgr = TableManager(env, config)

    metrics = Metrics()

    env.process(arrival_generator(
        env, config, cashier_mgr, kitchen_mgr, table_mgr, metrics
    ))
    env.process(monitor_process(
        env, config, cashier_mgr, table_mgr, metrics
    ))

    env.run(until=config.sim_minutes)

    report = metrics.report()
    print("=" * 55)
    print("  MANG INASAL SIMULATION -- DAILY REPORT")
    print("=" * 55)
    for key, value in report.items():
        if isinstance(value, float):
            print(f"  {key:35s}: {value:>10.2f}")
        else:
            print(f"  {key:35s}: {value:>10}")
    print("=" * 55)


if __name__ == "__main__":
    main()
