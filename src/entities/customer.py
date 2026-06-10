from typing import Optional

from src.config import Config


class Customer:
    _ids: int = 0

    def __init__(
        self,
        arrival_time: float,
        items_ordered: list[str],
        config: Config,
    ) -> None:
        Customer._ids += 1
        self.customer_id: int = Customer._ids
        self.arrival_time: float = arrival_time
        self.items_ordered: list[str] = items_ordered
        self.cashier_start: Optional[float] = None
        self.cashier_end: Optional[float] = None
        self.kitchen_start: Optional[float] = None
        self.kitchen_end: Optional[float] = None
        self.release_end: Optional[float] = None
        self.seat_start: Optional[float] = None
        self.seat_end: Optional[float] = None
        self.depart_time: Optional[float] = None
        self.abandoned: bool = False
        self.abandonment_stage: Optional[str] = None

        self.payment_method: Optional[str] = None
        self.payment_app: Optional[str] = None
        self.order_status: str = "pending"
        self.confirmation_deadline: float = float("inf")
        self.manual_override: bool = False

        if config.feature_patience:
            self.patience_deadline: float = arrival_time + config.patience_time()
        else:
            self.patience_deadline = float("inf")

        self._bottleneck_items = config.bottleneck_items

    @property
    def has_bottleneck_item(self) -> bool:
        return any(item in self._bottleneck_items for item in self.items_ordered)

    @property
    def total_system_time(self) -> Optional[float]:
        if self.depart_time is not None:
            return self.depart_time - self.arrival_time
        return None
