import src.engine.stages  # noqa: F401  -- register all stages

from src.config import Config
from src.entities.customer import Customer
from src.metrics import Metrics
from src.engine.registry import BUILTIN_STAGES, EXPERIMENTAL_STAGES


def _build_pipeline(config: Config) -> list[str]:
    if config.feature_kiosk:
        return ["kiosk", "cashier_confirm", "kitchen", "release", "dining"]
    return ["cashier", "kitchen", "release", "dining"]


def _resolve(key: str):
    if key in BUILTIN_STAGES:
        return BUILTIN_STAGES[key]
    return EXPERIMENTAL_STAGES[key]


def customer_lifecycle(
    env,
    config: Config,
    customer: Customer,
    resources: dict,
    metrics: Metrics,
) -> None:
    for stage_key in _build_pipeline(config):
        stage_fn = _resolve(stage_key)
        abandoned = yield from stage_fn(
            env, config, customer, resources, metrics
        )
        if abandoned:
            return

    customer.depart_time = env.now
    if customer.total_system_time is not None:
        metrics.total_system_times.append(customer.total_system_time)
    metrics.record_service_completion()
