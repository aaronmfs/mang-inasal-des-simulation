import asyncio
import json
import os
import random
import time
import threading
from collections import deque
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import simpy
import websockets

from src.config import Config
from src.entities.cashier import CashierManager
from src.entities.kitchen import KitchenManager
from src.entities.server import ServerManager
from src.entities.dining import DiningManager
from src.entities.kiosk import KioskManager
from src.engine.arrivals import arrival_generator
from src.engine.monitor import monitor_process
from src.metrics import Metrics

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "front-end"
HTTP_HOST = "0.0.0.0"
HTTP_PORT = 8000
WS_HOST = "0.0.0.0"
WS_PORT = 8765
ROLLING_WINDOW = 5


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass


def _ensure_metrics_key(report: dict, key: str, default: float = 0.0) -> float:
    for section in report.values():
        if key in section:
            return section[key]
    return default


def _compute_hist_bins(samples: list[float]) -> list[int]:
    bins = [0] * 11
    for val in samples:
        if val < 1:
            bins[0] += 1
        elif val < 2:
            bins[1] += 1
        elif val < 3:
            bins[2] += 1
        elif val < 4:
            bins[3] += 1
        elif val < 5:
            bins[4] += 1
        elif val < 6:
            bins[5] += 1
        elif val < 8:
            bins[6] += 1
        elif val < 10:
            bins[7] += 1
        elif val < 15:
            bins[8] += 1
        elif val < 20:
            bins[9] += 1
        else:
            bins[10] += 1
    return bins


def build_metrics_snapshot(
    metrics: Metrics,
    config: Config,
    now: float,
    time_labels: list | None = None,
    util_series: list | None = None,
    occ_series: list | None = None,
) -> dict:
    report = metrics.report(show_kiosk=config.feature_kiosk)
    hours = now / 60.0
    throughput = metrics.customers_served / max(hours, 1)

    avg_queue = _ensure_metrics_key(report, "avg_cashier_queue_len")
    max_queue = _ensure_metrics_key(report, "max_cashier_queue_len")
    avg_occ = _ensure_metrics_key(report, "avg_table_occupancy")
    max_occ = _ensure_metrics_key(report, "max_table_occupancy")
    util_pct = _ensure_metrics_key(report, "table_utilization_pct")

    return {
        "total_customers_served": metrics.customers_served,
        "total_customers_lost": metrics.customers_lost,
        "current_in_system": metrics.customers_entered - metrics.customers_served - metrics.customers_lost,
        "total_hours_simulated": round(hours, 2),
        "current_minute": int(now),
        "hourly_throughput": round(throughput, 2),
        "avg_cashier_queue_len": round(avg_queue, 2),
        "max_cashier_queue_len": int(max_queue),
        "kiosk_orders_created": metrics.kiosk_orders_created,
        "kiosk_online_confirmations": metrics.kiosk_online_confirmations,
        "kiosk_cash_payments": metrics.kiosk_cash_payments,
        "manual_orders_count": metrics.manual_orders_count,
        "confirmation_timeouts": metrics.confirmation_timeouts,
        "avg_cashier_wait_min": round(_ensure_metrics_key(report, "avg_cashier_wait_min"), 2),
        "max_cashier_wait_min": round(_ensure_metrics_key(report, "max_cashier_wait_min"), 2),
        "avg_kitchen_wait_min": round(_ensure_metrics_key(report, "avg_kitchen_wait_min"), 2),
        "max_kitchen_wait_min": round(_ensure_metrics_key(report, "max_kitchen_wait_min"), 2),
        "avg_table_wait_min": round(_ensure_metrics_key(report, "avg_table_wait_min"), 2),
        "max_table_wait_min": round(_ensure_metrics_key(report, "max_table_wait_min"), 2),
        "avg_cashier_service_time_min": round(_ensure_metrics_key(report, "avg_cashier_service_time_min"), 2),
        "max_cashier_service_time_min": round(_ensure_metrics_key(report, "max_cashier_service_time_min"), 2),
        "avg_kiosk_order_time_min": round(_ensure_metrics_key(report, "avg_kiosk_order_time_min"), 2),
        "max_kiosk_order_time_min": round(_ensure_metrics_key(report, "max_kiosk_order_time_min"), 2),
        "avg_dining_time_min": round(_ensure_metrics_key(report, "avg_dining_time_min"), 2),
        "max_dining_time_min": round(_ensure_metrics_key(report, "max_dining_time_min"), 2),
        "avg_system_time_min": round(_ensure_metrics_key(report, "avg_system_time_min"), 2),
        "avg_table_occupancy": round(avg_occ, 2),
        "max_table_occupancy": int(max_occ),
        "table_utilization_pct": round(util_pct, 2),
        "all_time_max_queue_len": int(max_queue),
        "all_time_max_table_occupancy": int(max_occ),
        "all_time_max_table_util_pct": round(util_pct, 2),
        "time_labels": time_labels if time_labels is not None else [],
        "utilization_series": util_series if util_series is not None else [],
        "occupancy_series": occ_series if occ_series is not None else [],
        "hist_cashier_wait": _compute_hist_bins(metrics.cashier_wait_times),
        "hist_kitchen_wait": _compute_hist_bins(metrics.kitchen_wait_times),
        "hist_table_wait": _compute_hist_bins(metrics.table_wait_times),
    }


class SimRunner:
    def __init__(self, initial_config: Config):
        self.config = initial_config
        self._config_lock = threading.Lock()
        self.env: simpy.Environment | None = None
        self.resources: dict | None = None
        self.metrics: Metrics | None = None

        self.running = False
        self.paused = True
        self.reset_requested = False
        self.speed = 1.0
        self.max_throughput = False
        self._kiosk_disabled = False
        self._saved_kiosk_count = None

        self._thread: threading.Thread | None = None
        self._on_tick = None

        self._time_labels: deque = deque(maxlen=ROLLING_WINDOW)
        self._util_series: deque = deque(maxlen=ROLLING_WINDOW)
        self._occ_series: deque = deque(maxlen=ROLLING_WINDOW)

    def apply_config_overrides(self, overrides: dict) -> None:
        with self._config_lock:
            data = self.config._data
            if "active_cashiers" in overrides:
                data["cashier_count"] = overrides["active_cashiers"]
            if "active_kiosks" in overrides:
                data.setdefault("kiosk", {})["kiosk_count"] = overrides["active_kiosks"]
            if "customer_arrival_rate" in overrides:
                data["arrival"]["regular_rate_per_minute"] = overrides["customer_arrival_rate"]
            if "kitchen_staff_capacity" in overrides:
                data["cook_count"] = overrides["kitchen_staff_capacity"]
            if "total_table_capacity" in overrides:
                data["total_tables"] = overrides["total_table_capacity"]
            if "order_type_distribution" in overrides:
                dist = overrides["order_type_distribution"]
                if "kiosk" in dist:
                    pass
            if "dining_choice_distribution" in overrides:
                pass
            if "speed" in overrides:
                self.speed = float(overrides["speed"])
            if "max_throughput" in overrides:
                self.max_throughput = bool(overrides["max_throughput"])
            if "kiosk_disabled" in overrides:
                disabled = bool(overrides["kiosk_disabled"])
                if disabled and not self._kiosk_disabled:
                    self._saved_kiosk_count = data.setdefault("kiosk", {}).get("kiosk_count", 0)
                    data["kiosk"]["kiosk_count"] = 0
                elif not disabled and self._kiosk_disabled and self._saved_kiosk_count is not None:
                    data["kiosk"]["kiosk_count"] = self._saved_kiosk_count
                    self._saved_kiosk_count = None
                self._kiosk_disabled = disabled

        if self.resources is not None:
            if self.config.feature_kiosk and self.config.num_kiosks > 0:
                if "kiosk" not in self.resources:
                    self.resources["kiosk"] = KioskManager(self.env, self.config)
            else:
                self.resources.pop("kiosk", None)

    def _setup(self) -> None:
        random.seed(self.config.random_seed)
        self.env = simpy.Environment()
        self.resources = {
            "cashier": CashierManager(self.env, self.config),
            "kitchen": KitchenManager(self.env, self.config),
            "server": ServerManager(self.env, self.config),
            "dining": DiningManager(self.env, self.config),
        }
        if self.config.feature_kiosk and self.config.num_kiosks > 0:
            self.resources["kiosk"] = KioskManager(self.env, self.config)

        self.metrics = Metrics(
            sim_hours=self.config.sim_hours,
            table_capacity=self.config.num_tables,
        )

        self.env.process(arrival_generator(
            self.env, self.config, self.resources, self.metrics
        ))
        self.env.process(monitor_process(
            self.env, self.config, self.resources, self.metrics
        ))

        self._time_labels.clear()
        self._util_series.clear()
        self._occ_series.clear()

    def _tick(self) -> None:
        if self.env is None:
            return
        self.env.run(until=self.env.now + 1)

    def _build_snapshot(self) -> dict:
        now = self.env.now if self.env else 0
        self._time_labels.append(int(now))
        report = self.metrics.report(show_kiosk=self.config.feature_kiosk) if self.metrics else {}
        util = _ensure_metrics_key(report, "table_utilization_pct")
        occ = _ensure_metrics_key(report, "avg_table_occupancy")
        self._util_series.append(util)
        self._occ_series.append(occ)
        data = build_metrics_snapshot(
            self.metrics, self.config, now,
            time_labels=list(self._time_labels),
            util_series=list(self._util_series),
            occ_series=list(self._occ_series),
        )
        return {"type": "metrics", "data": data}

    def loop(self, on_tick) -> None:
        self._on_tick = on_tick
        self._setup()
        self.running = True

        while self.running:
            if self.reset_requested:
                self.reset_requested = False
                self._setup()
                if self._on_tick:
                    self._on_tick(self._build_snapshot())
                continue

            if self.paused:
                time.sleep(0.05)
                continue

            tick_start = time.perf_counter()
            self._tick()

            if self._on_tick:
                self._on_tick(self._build_snapshot())

            if self.max_throughput:
                continue
            elapsed = time.perf_counter() - tick_start
            target = 1.0 / max(self.speed, 0.1)
            remaining = target - elapsed
            if remaining > 0:
                time.sleep(remaining)

        self.running = False

    def start_in_thread(self, on_tick) -> threading.Thread:
        self._thread = threading.Thread(
            target=self.loop, args=(on_tick,), daemon=True
        )
        self._thread.start()
        return self._thread


def run_http_server():
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), StaticHandler)
    print(f"[server] HTTP serving {FRONTEND_DIR} on http://{HTTP_HOST}:{HTTP_PORT}")
    server.serve_forever()


async def broadcast_metrics(websocket, message: dict):
    try:
        await websocket.send(json.dumps(message))
    except websockets.exceptions.ConnectionClosed:
        pass


async def _send_all(payload: str):
    if not connected_clients:
        return
    for c in list(connected_clients):
        try:
            await c.send(payload)
        except websockets.exceptions.ConnectionClosed:
            connected_clients.discard(c)


async def _broadcast_state(status: str):
    payload = json.dumps({"type": "state", "status": status})
    await _send_all(payload)


async def ws_handler(websocket):
    global sim_runner
    connected_clients.add(websocket)
    await _broadcast_state("paused")
    try:
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                action = msg.get("action")

                if action == "play":
                    sim_runner.paused = False
                    await _broadcast_state("running")

                elif action == "pause":
                    sim_runner.paused = True
                    await _broadcast_state("paused")

                elif action == "stop":
                    sim_runner.paused = True
                    sim_runner.running = False
                    await _broadcast_state("stopped")

                elif action == "reset":
                    sim_runner.reset_requested = True
                    sim_runner.paused = True
                    snapshot = {
                        "type": "metrics",
                        "data": {
                            "total_customers_served": 0,
                            "total_customers_lost": 0,
                            "current_in_system": 0,
                            "total_hours_simulated": 0,
                            "current_minute": 0,
                            "hourly_throughput": 0,
                            "avg_cashier_queue_len": 0,
                            "max_cashier_queue_len": 0,
                            "kiosk_orders_created": 0,
                            "kiosk_online_confirmations": 0,
                            "kiosk_cash_payments": 0,
                            "manual_orders_count": 0,
                            "confirmation_timeouts": 0,
                            "avg_cashier_wait_min": 0, "max_cashier_wait_min": 0,
                            "avg_kitchen_wait_min": 0, "max_kitchen_wait_min": 0,
                            "avg_table_wait_min": 0, "max_table_wait_min": 0,
                            "avg_cashier_service_time_min": 0, "max_cashier_service_time_min": 0,
                            "avg_kiosk_order_time_min": 0, "max_kiosk_order_time_min": 0,
                            "avg_dining_time_min": 0, "max_dining_time_min": 0,
                            "avg_system_time_min": 0,
                            "avg_table_occupancy": 0, "max_table_occupancy": 0,
                            "table_utilization_pct": 0,
                            "all_time_max_queue_len": 0,
                            "all_time_max_table_occupancy": 0,
                            "all_time_max_table_util_pct": 0,
                            "time_labels": [],
                            "utilization_series": [],
                            "occupancy_series": [],
                            "hist_cashier_wait": [0]*11,
                            "hist_kitchen_wait": [0]*11,
                            "hist_table_wait": [0]*11,
                        },
                    }
                    await _send_all(json.dumps(snapshot))

                elif action == "update_config":
                    params = msg.get("params", {})
                    sim_runner.apply_config_overrides(params)
        except websockets.exceptions.ConnectionClosed:
            pass
    finally:
        connected_clients.discard(websocket)


def on_sim_tick(message: dict):
    asyncio.run_coroutine_threadsafe(
        _broadcast_to_all(message), loop_ref
    )


async def _broadcast_to_all(message: dict):
    if not connected_clients:
        return
    await _send_all(json.dumps(message))


connected_clients: set = set()
sim_runner: SimRunner | None = None
loop_ref: asyncio.AbstractEventLoop | None = None


async def main():
    global sim_runner, loop_ref
    loop_ref = asyncio.get_running_loop()

    cfg = Config()
    sim_runner = SimRunner(cfg)

    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    sim_runner.start_in_thread(on_sim_tick)

    print(f"[server] WebSocket on ws://{WS_HOST}:{WS_PORT}")
    async with websockets.serve(ws_handler, WS_HOST, WS_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
