import simpy

from src.config import Config
from src.entities.customer import Customer
from src.entities.cashier import CashierManager
from src.entities.kitchen import KitchenManager
from src.entities.dining import TableManager
from src.metrics import Metrics


def customer_lifecycle(
    env: simpy.Environment,
    config: Config,
    customer: Customer,
    cashier_mgr: CashierManager,
    kitchen_mgr: KitchenManager,
    table_mgr: TableManager,
    metrics: Metrics,
) -> None:
    cashier_wait_start = env.now
    with cashier_mgr.request() as req:
        yield req
        metrics.record_cashier_wait(env.now - cashier_wait_start)
        customer.cashier_start = env.now
        yield env.timeout(cashier_mgr.service_time())
        customer.cashier_end = env.now

    kitchen_wait_start = env.now
    with kitchen_mgr.request() as req:
        yield req
        metrics.record_kitchen_wait(env.now - kitchen_wait_start)
        customer.kitchen_start = env.now
        yield env.timeout(kitchen_mgr.prep_time(env.now, customer))
        customer.kitchen_end = env.now

    yield env.timeout(config.release_time())
    customer.release_end = env.now

    table_wait_start = env.now
    with table_mgr.request() as req:
        yield req
        metrics.record_table_wait(env.now - table_wait_start)
        customer.seat_start = env.now
        yield env.timeout(table_mgr.dining_time())
        customer.seat_end = env.now

    customer.depart_time = env.now
    if customer.total_system_time is not None:
        metrics.total_system_times.append(customer.total_system_time)
    metrics.record_service_completion()
