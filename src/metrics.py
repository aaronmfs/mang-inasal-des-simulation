import statistics
from typing import Dict, List, Tuple


class Metrics:
    def __init__(self) -> None:
        self.cashier_wait_times: List[float] = []
        self.kitchen_wait_times: List[float] = []
        self.table_wait_times: List[float] = []
        self.total_system_times: List[float] = []
        self.queue_length_samples: List[Tuple[float, int]] = []
        self.table_occupancy_samples: List[Tuple[float, int]] = []
        self.customers_served: int = 0

    def record_cashier_wait(self, wait: float) -> None:
        self.cashier_wait_times.append(wait)

    def record_kitchen_wait(self, wait: float) -> None:
        self.kitchen_wait_times.append(wait)

    def record_table_wait(self, wait: float) -> None:
        self.table_wait_times.append(wait)

    def record_service_completion(self) -> None:
        self.customers_served += 1

    def snapshot_queue(self, time: float, length: int) -> None:
        self.queue_length_samples.append((time, length))

    def snapshot_tables(self, time: float, occupied: int) -> None:
        self.table_occupancy_samples.append((time, occupied))

    def report(self) -> Dict[str, float]:
        result: Dict[str, float] = {}

        if self.cashier_wait_times:
            result["avg_cashier_wait_min"] = statistics.mean(self.cashier_wait_times)
            result["max_cashier_wait_min"] = max(self.cashier_wait_times)
        if self.kitchen_wait_times:
            result["avg_kitchen_wait_min"] = statistics.mean(self.kitchen_wait_times)
            result["max_kitchen_wait_min"] = max(self.kitchen_wait_times)
        if self.table_wait_times:
            result["avg_table_wait_min"] = statistics.mean(self.table_wait_times)
            result["max_table_wait_min"] = max(self.table_wait_times)
        if self.total_system_times:
            result["avg_system_time_min"] = statistics.mean(self.total_system_times)
        if self.queue_length_samples:
            lengths = [length for _, length in self.queue_length_samples]
            result["avg_cashier_queue_len"] = statistics.mean(lengths)
            result["max_cashier_queue_len"] = float(max(lengths))
        if self.table_occupancy_samples:
            occ = [o for _, o in self.table_occupancy_samples]
            result["avg_table_occupancy"] = statistics.mean(occ)
            result["max_table_occupancy"] = float(max(occ))
            result["table_utilization_pct"] = (
                statistics.mean(occ) / 154.0 * 100.0
            )

        result["total_customers_served"] = float(self.customers_served)
        result["hourly_throughput"] = self.customers_served / 16.0

        return result
