import random

import simpy

from src.config import Config
from src.entities.cashier import CashierManager
from src.entities.kitchen import KitchenManager
from src.entities.server import ServerManager
from src.entities.dining import DiningManager
from src.entities.kiosk import KioskManager
from src.engine.arrivals import arrival_generator
from src.engine.monitor import monitor_process
from src.metrics import Metrics


def main() -> None:
    config = Config()
    random.seed(config.random_seed)

    env = simpy.Environment()

    resources = {
        "cashier": CashierManager(env, config),
        "kitchen": KitchenManager(env, config),
        "server": ServerManager(env, config),
        "dining": DiningManager(env, config),
    }

    if config.feature_kiosk:
        resources["kiosk"] = KioskManager(env, config)

    metrics = Metrics(sim_hours=config.sim_hours, table_capacity=config.num_tables)

    env.process(arrival_generator(env, config, resources, metrics))
    env.process(monitor_process(env, config, resources, metrics))

    env.run(until=config.sim_minutes)

    report = metrics.report()
    summary = report["summary"]
    details = report["details"]

    print("=" * 55)
    print("  MANG INASAL SIMULATION -- DAILY REPORT")
    print("=" * 55)
    print("  --- SUMMARY ---")
    for key, value in summary.items():
        print(f"  {key:35s}: {value:>10.2f}")
    print("  --- DETAILS ---")
    for key, value in details.items():
        print(f"  {key:35s}: {value:>10.2f}")
    print("=" * 55)


if __name__ == "__main__":
    main()
