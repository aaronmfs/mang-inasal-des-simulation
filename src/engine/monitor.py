import simpy

from src.config import Config
from src.entities.cashier import CashierManager
from src.entities.dining import TableManager
from src.metrics import Metrics


def monitor_process(
    env: simpy.Environment,
    config: Config,
    cashier_mgr: CashierManager,
    table_mgr: TableManager,
    metrics: Metrics,
) -> None:
    while True:
        yield env.timeout(1.0)
        if env.now >= config.sim_minutes:
            return
        metrics.snapshot_queue(env.now, len(cashier_mgr.resource.queue))
        metrics.snapshot_tables(env.now, table_mgr.resource.count)
