import json
import random
from typing import Any


class Config:
    def __init__(self, path: str = "config.json") -> None:
        with open(path) as f:
            self._data: dict[str, Any] = json.load(f)

    # Feature gates
    @property
    def feature_patience(self) -> bool:
        return self._data["features"]["customer_patience_and_abandonment"]

    @property
    def feature_server_resource(self) -> bool:
        return self._data["features"]["server_resource_bottleneck"]

    @property
    def feature_kiosk(self) -> bool:
        return self._data["features"]["kiosk_experimental_mode"]

    @property
    def feature_manual_override(self) -> bool:
        return (
            self.feature_kiosk
            and self._data["kiosk"]["allow_cashier_manual_override"]
        )

    # Duration
    @property
    def sim_minutes(self) -> int:
        return self._data["simulation_hours"] * 60

    @property
    def random_seed(self) -> int:
        return self._data.get("random_seed", 42)

    @property
    def sim_hours(self) -> int:
        return self._data["simulation_hours"]

    # Staff / capacity
    @property
    def num_cashiers(self) -> int:
        return self._data["cashier_count"]

    @property
    def kitchen_capacity(self) -> int:
        return self._data["cook_count"]

    @property
    def num_servers(self) -> int:
        return self._data["server_count"]

    @property
    def num_tables(self) -> int:
        return self._data["total_tables"]

    @property
    def num_kiosks(self) -> int:
        return self._data["kiosk"]["kiosk_count"]

    # Arrival
    def is_peak_hour(self, now: float) -> bool:
        for w in self._data["arrival"]["peak_windows"]:
            if w["start_minute"] <= now <= w["end_minute"]:
                return True
        return False

    @property
    def regular_arrival_rate(self) -> float:
        return self._data["arrival"]["regular_rate_per_minute"]

    @property
    def peak_arrival_rate(self) -> float:
        return self._data["arrival"]["peak_rate_per_minute"]

    # Distribution helpers
    def cashier_service_time(self) -> float:
        lo, hi = self._data["cashier_service_time_range_minutes"]
        mode = self._data["cashier_service_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def kitchen_prep_time(self, now: float) -> float:
        k = self._data["kitchen"]
        if self.is_peak_hour(now):
            lo, hi = k["peak_prep_time_range_minutes"]
            mode = k["peak_prep_time_mode_minutes"]
        else:
            lo, hi = k["regular_prep_time_range_minutes"]
            mode = k["regular_prep_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def bottleneck_extra_time(self) -> float:
        b = self._data["kitchen"]
        lo, hi = b["bottleneck_extra_range_minutes"]
        mode = b["bottleneck_extra_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def server_delivery_time(self) -> float:
        lo, hi = self._data["server_delivery_time_range_minutes"]
        return random.uniform(lo, hi)

    def dining_time(self) -> float:
        lo, hi = self._data["dining_time_range_minutes"]
        mode = self._data["dining_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def patience_time(self) -> float:
        lo, hi = self._data["customer_patience_range_minutes"]
        mode = self._data["customer_patience_mode_minutes"]
        return random.triangular(lo, hi, mode)

    # Kiosk distribution helpers
    def kiosk_order_time(self) -> float:
        k = self._data["kiosk"]
        lo, hi = k["order_time_range_minutes"]
        mode = k["order_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def kiosk_confirm_service_time(self) -> float:
        k = self._data["kiosk"]
        lo, hi = k["confirm_service_time_range_minutes"]
        mode = k["confirm_service_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def kiosk_cash_service_time(self) -> float:
        k = self._data["kiosk"]
        lo, hi = k["cash_service_time_range_minutes"]
        mode = k["cash_service_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    def manual_order_service_time(self) -> float:
        k = self._data["kiosk"]
        lo, hi = k["manual_order_time_range_minutes"]
        mode = k["manual_order_time_mode_minutes"]
        return random.triangular(lo, hi, mode)

    @property
    def manual_override_probability(self) -> float:
        return self._data["kiosk"]["manual_override_probability"]

    @property
    def kiosk_timeout_enabled(self) -> bool:
        return self._data["kiosk"]["timeout"]["enable_timeout"]

    @property
    def confirmation_time_limit(self) -> float:
        return float(self._data["kiosk"]["timeout"]["confirmation_time_limit_minutes"])

    @property
    def accept_online_cash_apps(self) -> bool:
        return self._data["kiosk"]["payment"]["accept_online_cash_apps"]

    @property
    def supported_apps(self) -> list[str]:
        return self._data["kiosk"]["payment"]["supported_apps"]

    @property
    def monitoring_interval(self) -> float:
        return self._data["monitoring_interval_minutes"]

    @property
    def min_order_items(self) -> int:
        return self._data["menu"]["min_items"]

    @property
    def max_order_items(self) -> int:
        return self._data["menu"]["max_items"]

    @property
    def kiosk_online_payment_probability(self) -> float:
        return self._data["kiosk"]["payment"]["online_payment_probability"]

    # Menu
    @property
    def bottleneck_items(self) -> tuple[str, ...]:
        return tuple(self._data["kitchen"]["bottleneck_items"])

    @property
    def menu_items(self) -> tuple[str, ...]:
        return tuple(self._data["menu"]["items"])

    @property
    def menu_weights(self) -> tuple[float, ...]:
        return tuple(self._data["menu"]["weights"])

    def generate_order(self) -> list[str]:
        num_items = random.randint(self.min_order_items, self.max_order_items)
        return random.choices(
            list(self.menu_items),
            weights=list(self.menu_weights),
            k=num_items,
        )
