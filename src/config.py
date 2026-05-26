import random
from dataclasses import dataclass, field
from typing import Tuple


BOTTLENECK_ITEMS: Tuple[str, ...] = ("Regular Chicken", "Sisig")


@dataclass(frozen=True)
class Config:
    sim_minutes: int = 960
    random_seed: int = 42

    regular_arrival_rate: float = 0.29
    peak_arrival_rate: float = 0.58

    lunch_start: int = 300
    lunch_end: int = 420
    dinner_start: int = 720
    dinner_end: int = 840

    num_cashiers: int = 3
    num_tables: int = 154
    kitchen_capacity: int = 10

    cashier_min: float = 2.0
    cashier_mode: float = 3.0
    cashier_max: float = 7.0

    kitchen_prep_min: float = 7.0
    kitchen_prep_mode: float = 7.0
    kitchen_prep_max: float = 10.0

    kitchen_prep_peak_min: float = 15.0
    kitchen_prep_peak_mode: float = 17.0
    kitchen_prep_peak_max: float = 20.0

    bottleneck_extra_min: float = 3.0
    bottleneck_extra_mode: float = 5.0
    bottleneck_extra_max: float = 8.0

    release_min: float = 0.5
    release_max: float = 1.0

    dining_min: float = 20.0
    dining_mode: float = 30.0
    dining_max: float = 50.0

    menu_items: Tuple[str, ...] = field(default=(
        "Regular Chicken", "Sisig", "Chicken BBQ", "Pork BBQ",
        "Lumpia", "Rice", "Drink"
    ))
    menu_weights: Tuple[float, ...] = field(default=(
        0.30, 0.20, 0.15, 0.10, 0.05, 0.10, 0.10
    ))

    def is_peak_hour(self, now: float) -> bool:
        return (self.lunch_start <= now <= self.lunch_end) or \
               (self.dinner_start <= now <= self.dinner_end)

    def cashier_service_time(self) -> float:
        return random.triangular(
            self.cashier_min, self.cashier_max, self.cashier_mode
        )

    def kitchen_prep_time(self, now: float) -> float:
        if self.is_peak_hour(now):
            return random.triangular(
                self.kitchen_prep_peak_min,
                self.kitchen_prep_peak_max,
                self.kitchen_prep_peak_mode
            )
        return random.triangular(
            self.kitchen_prep_min,
            self.kitchen_prep_max,
            self.kitchen_prep_mode
        )

    def bottleneck_extra_time(self) -> float:
        return random.triangular(
            self.bottleneck_extra_min,
            self.bottleneck_extra_max,
            self.bottleneck_extra_mode
        )

    def release_time(self) -> float:
        return random.uniform(self.release_min, self.release_max)

    def dining_time(self) -> float:
        return random.triangular(
            self.dining_min, self.dining_max, self.dining_mode
        )

    def generate_order(self) -> list[str]:
        num_items = random.randint(1, 3)
        return random.choices(
            list(self.menu_items),
            weights=list(self.menu_weights),
            k=num_items
        )
