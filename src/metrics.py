import statistics
from typing import Dict, List, Tuple


class Metrics:
    def __init__(self, sim_hours: int = 16, table_capacity: int = 39) -> None:
        self.cashier_wait_times: List[float] = []
        self.cashier_service_times: List[float] = []
        self.kitchen_wait_times: List[float] = []
        self.table_wait_times: List[float] = []
        self.total_system_times: List[float] = []
        self.queue_length_samples: List[Tuple[float, int]] = []
        self.table_occupancy_samples: List[Tuple[float, int]] = []
        self.customers_served: int = 0
        self.customers_lost: int = 0
        self.dining_times: List[float] = []
        self.kiosk_order_times: List[float] = []
        self.kiosk_orders_created: int = 0
        self.kiosk_online_confirmations: int = 0
        self.kiosk_cash_payments: int = 0
        self.manual_orders_count: int = 0
        self.confirmation_timeouts: int = 0
        self.sim_hours: int = sim_hours
        self._table_capacity: int = table_capacity

    def record_cashier_wait(self, wait: float) -> None:
        self.cashier_wait_times.append(wait)

    def record_cashier_service_time(self, duration: float) -> None:
        self.cashier_service_times.append(duration)

    def record_kitchen_wait(self, wait: float) -> None:
        self.kitchen_wait_times.append(wait)

    def record_table_wait(self, wait: float) -> None:
        self.table_wait_times.append(wait)

    def record_dining_time(self, duration: float) -> None:
        self.dining_times.append(duration)

    def record_abandonment(self) -> None:
        self.customers_lost += 1

    def record_service_completion(self) -> None:
        self.customers_served += 1

    def record_kiosk_order(self) -> None:
        self.kiosk_orders_created += 1

    def record_kiosk_order_time(self, duration: float) -> None:
        self.kiosk_order_times.append(duration)

    def record_kiosk_online_confirmation(self) -> None:
        self.kiosk_online_confirmations += 1

    def record_kiosk_cash_payment(self) -> None:
        self.kiosk_cash_payments += 1

    def record_manual_order(self) -> None:
        self.manual_orders_count += 1

    def record_confirmation_timeout(self) -> None:
        self.confirmation_timeouts += 1

    def snapshot_queue(self, time: float, length: int) -> None:
        self.queue_length_samples.append((time, length))

    def snapshot_tables(self, time: float, occupied: int) -> None:
        self.table_occupancy_samples.append((time, occupied))

    def report(self, show_kiosk: bool = False) -> Dict[str, Dict[str, float]]:
        summary: Dict[str, float] = {}
        details: Dict[str, float] = {}

        summary["total_customers_served"] = float(self.customers_served)
        summary["total_customers_lost"] = float(self.customers_lost)
        summary["total_hours_simulated"] = float(self.sim_hours)
        summary["hourly_throughput"] = (
            self.customers_served / max(self.sim_hours, 1)
        )

        if show_kiosk:
            details["kiosk_orders_created"] = float(self.kiosk_orders_created)
            details["kiosk_online_confirmations"] = float(self.kiosk_online_confirmations)
            details["kiosk_cash_payments"] = float(self.kiosk_cash_payments)
            details["manual_orders_count"] = float(self.manual_orders_count)
            details["confirmation_timeouts"] = float(self.confirmation_timeouts)

        if self.cashier_wait_times:
            details["avg_cashier_wait_min"] = statistics.mean(self.cashier_wait_times)
            details["max_cashier_wait_min"] = max(self.cashier_wait_times)
        if self.kitchen_wait_times:
            details["avg_kitchen_wait_min"] = statistics.mean(self.kitchen_wait_times)
            details["max_kitchen_wait_min"] = max(self.kitchen_wait_times)
        if self.table_wait_times:
            details["avg_table_wait_min"] = statistics.mean(self.table_wait_times)
            details["max_table_wait_min"] = max(self.table_wait_times)
        if self.cashier_service_times:
            details["avg_cashier_service_time_min"] = statistics.mean(self.cashier_service_times)
            details["max_cashier_service_time_min"] = max(self.cashier_service_times)
        if self.kiosk_order_times:
            details["avg_kiosk_order_time_min"] = statistics.mean(self.kiosk_order_times)
            details["max_kiosk_order_time_min"] = max(self.kiosk_order_times)
        if self.dining_times:
            details["avg_dining_time_min"] = statistics.mean(self.dining_times)
            details["max_dining_time_min"] = max(self.dining_times)
        if self.total_system_times:
            details["avg_system_time_min"] = statistics.mean(self.total_system_times)
        if self.queue_length_samples:
            lengths = [length for _, length in self.queue_length_samples]
            details["avg_cashier_queue_len"] = statistics.mean(lengths)
            details["max_cashier_queue_len"] = float(max(lengths))
        if self.table_occupancy_samples:
            occ = [o for _, o in self.table_occupancy_samples]
            details["avg_table_occupancy"] = statistics.mean(occ)
            details["max_table_occupancy"] = float(max(occ))
            details["table_utilization_pct"] = (
                statistics.mean(occ) / self._table_capacity * 100.0
            )

        return {"summary": summary, "details": details}
