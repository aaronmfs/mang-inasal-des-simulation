import random

import simpy
from simpy.resources.resource import Request

from src.config import Config
from src.entities.customer import Customer
from src.metrics import Metrics
from src.engine.registry import BUILTIN_STAGES, EXPERIMENTAL_STAGES


def _abandon(customer: Customer, metrics: Metrics, stage_name: str) -> None:
    customer.abandoned = True
    customer.abandonment_stage = stage_name
    metrics.record_abandonment()


def _race_request(
    env: simpy.Environment,
    config: Config,
    customer: Customer,
    metrics: Metrics,
    req: Request,
    stage_name: str,
) -> bool:
    if not config.feature_patience:
        yield req
        return False
    remaining = customer.patience_deadline - env.now
    if remaining <= 0:
        _abandon(customer, metrics, stage_name)
        return True
    result = yield req | env.timeout(remaining)
    if req not in result:
        _abandon(customer, metrics, stage_name)
        return True
    return False


def cashier_step(env, config, customer, resources, metrics):
    cashier_wait_start = env.now
    with resources["cashier"].request() as req:
        abandoned = yield from _race_request(
            env, config, customer, metrics, req, "cashier_queue"
        )
        if abandoned:
            return True
        metrics.record_cashier_wait(env.now - cashier_wait_start)
        customer.cashier_start = env.now
        yield env.timeout(resources["cashier"].service_time())
        customer.cashier_end = env.now
        metrics.record_cashier_service_time(customer.cashier_end - customer.cashier_start)
    return False


def kiosk_step(env, config, customer, resources, metrics):
    with resources["kiosk"].request() as req:
        abandoned = yield from _race_request(
            env, config, customer, metrics, req, "kiosk_queue"
        )
        if abandoned:
            return True
        customer.items_ordered = config.generate_order()
        kiosk_start = env.now
        yield env.timeout(resources["kiosk"].order_time())
        metrics.record_kiosk_order_time(env.now - kiosk_start)
        if config.accept_online_cash_apps and random.random() < 0.5:
            customer.payment_method = "kiosk_online"
            customer.payment_app = random.choice(config.supported_apps)
        else:
            customer.payment_method = "kiosk_cash"
        if config.kiosk_timeout_enabled:
            customer.confirmation_deadline = (
                env.now + config.confirmation_time_limit
            )
        customer.order_status = "awaiting_confirmation"
    metrics.record_kiosk_order()
    return False


def cashier_confirm_step(env, config, customer, resources, metrics):
    deadline = float("inf")
    if config.feature_patience:
        deadline = min(deadline, customer.patience_deadline)
    if config.kiosk_timeout_enabled:
        deadline = min(deadline, customer.confirmation_deadline)

    cashier_wait_start = env.now
    with resources["cashier"].request() as req:
        remaining = deadline - env.now
        if remaining <= 0:
            if config.kiosk_timeout_enabled and env.now >= customer.confirmation_deadline:
                customer.order_status = "expired"
                metrics.record_confirmation_timeout()
            else:
                _abandon(customer, metrics, "cashier_confirm")
            return True

        result = yield req | env.timeout(remaining)
        if req not in result:
            if config.kiosk_timeout_enabled and env.now >= customer.confirmation_deadline:
                customer.order_status = "expired"
                metrics.record_confirmation_timeout()
            else:
                _abandon(customer, metrics, "cashier_confirm")
            return True

        metrics.record_cashier_wait(env.now - cashier_wait_start)
        customer.cashier_start = env.now

        if customer.manual_override:
            customer.items_ordered = config.generate_order()
            yield env.timeout(config.manual_order_service_time())
            customer.order_status = "paid"
            customer.payment_method = "counter_cash"
            metrics.record_manual_order()
        elif customer.payment_method == "kiosk_online":
            yield env.timeout(config.kiosk_confirm_service_time())
            customer.order_status = "confirmed"
            metrics.record_kiosk_online_confirmation()
        else:
            yield env.timeout(config.kiosk_cash_service_time())
            customer.order_status = "paid"
            metrics.record_kiosk_cash_payment()

        customer.cashier_end = env.now
        metrics.record_cashier_service_time(customer.cashier_end - customer.cashier_start)
    return False


def kitchen_step(env, config, customer, resources, metrics):
    kitchen_wait_start = env.now
    with resources["kitchen"].request() as req:
        abandoned = yield from _race_request(
            env, config, customer, metrics, req, "kitchen_queue"
        )
        if abandoned:
            return True
        metrics.record_kitchen_wait(env.now - kitchen_wait_start)
        customer.kitchen_start = env.now
        yield env.timeout(resources["kitchen"].prep_time(env.now, customer))
        customer.kitchen_end = env.now
    return False


def release_step(env, config, customer, resources, metrics):
    if config.feature_server_resource:
        with resources["server"].request() as req:
            abandoned = yield from _race_request(
                env, config, customer, metrics, req, "release_queue"
            )
            if abandoned:
                return True
            yield env.timeout(resources["server"].delivery_time())
    else:
        yield env.timeout(config.server_delivery_time())
    customer.release_end = env.now
    return False


def dining_step(env, config, customer, resources, metrics):
    table_wait_start = env.now
    with resources["dining"].request() as req:
        abandoned = yield from _race_request(
            env, config, customer, metrics, req, "dining_queue"
        )
        if abandoned:
            return True
        metrics.record_table_wait(env.now - table_wait_start)
        customer.seat_start = env.now
        yield env.timeout(resources["dining"].dining_time())
        customer.seat_end = env.now
        metrics.record_dining_time(customer.seat_end - customer.seat_start)
    return False


BUILTIN_STAGES["cashier"] = cashier_step
BUILTIN_STAGES["kitchen"] = kitchen_step
BUILTIN_STAGES["release"] = release_step
BUILTIN_STAGES["dining"] = dining_step

EXPERIMENTAL_STAGES["kiosk"] = kiosk_step
EXPERIMENTAL_STAGES["cashier_confirm"] = cashier_confirm_step
