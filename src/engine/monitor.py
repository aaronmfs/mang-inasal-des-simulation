import simpy

from src.config import Config
from src.metrics import Metrics


def monitor_process(
    env: simpy.Environment,
    config: Config,
    resources: dict,
    metrics: Metrics,
) -> None:
    while True:
        yield env.timeout(1.0)
        if env.now >= config.sim_minutes:
            return
        metrics.snapshot_queue(
            env.now, len(resources["cashier"].resource.queue)
        )
        metrics.snapshot_tables(
            env.now, resources["dining"].resource.count
        )
