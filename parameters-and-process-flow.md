# Parameters & Process Flow

## Process Flow

Every customer entity flows through a configurable pipeline of FIFO stages. Two pipelines are available:

**Standard mode (kiosk disabled):**
```
Arrival → Cashier Queue → Kitchen Prep → Release Claim → Seating Wait → Dining → Depart
```

**Kiosk-first mode (kiosk enabled):**
```
Arrival → Kiosk → Cashier Confirm → Kitchen Prep → Release Claim → Seating Wait → Dining → Depart
```

In kiosk mode, customers place orders at self-service kiosks and either pay online (quick cashier confirmation) or at the counter. A configurable `manual_override_probability` bypasses the kiosk for non-tech-savvy customers, routing them directly to a cashier for full order entry + payment. Kiosk state and capacity can be toggled at runtime via the web interface — no restart required.

Each stage is parameterized with bounded probability distributions triangulated from interview data and direct observation:

| Stage | Resource | Capacity | Distribution |
|-------|----------|----------|-------------|
| Arrival | — | — | NHPP (λ=0.29 regular, 0.58 peak) |
| Kiosk *(optional)* | simpy.Resource | configurable via `kiosk.kiosk_count` | triangular(1, 2, 5) min |
| Cashier | simpy.Resource | 3 counters | triangular(2, 3, 7) min / kiosk confirm triangular(0.5, 1, 1.5) min |
| Kitchen | simpy.Resource | 10 stations | triangular(7, 7, 10) regular / triangular(15, 17, 20) peak + bottleneck surcharge |
| Release | simpy.Resource *(optional)* | 4 servers | uniform(0.5, 1.0) min |
| Dining | simpy.Resource | 39 tables | triangular(20, 30, 50) min |

Peak hours (11AM–1PM lunch, 6PM–8PM dinner) increase both arrival rate and kitchen prep times. "Regular Chicken" and "Sisig" orders incur extra prep time.

Customers have configurable patience limits: if wait time exceeds their sampled patience (triangular(15, 30, 60) min), they abandon the queue. Feature flags toggle patience, the server resource bottleneck, and the kiosk-first workflow independently.

## Parameter Reference

All simulation parameters are externalized to `config.json` — no hardcoded values in source code. The `Config` class in `src/config.py` loads this file at runtime and exposes each value via typed properties and distribution helper methods.

### Feature Flags

| Flag | JSON Path | Type | Default | Effect |
|------|-----------|------|---------|--------|
| Customer Patience | `features.customer_patience_and_abandonment` | bool | `true` | Customers abandon the queue if wait exceeds sampled patience |
| Server Bottleneck | `features.server_resource_bottleneck` | bool | `true` | Release stage requires a server resource (capacity = `server_count`) |
| Kiosk Experimental Mode | `features.kiosk_experimental_mode` | bool | `true` | Enables kiosk-first workflow (kiosk → cashier confirm) |

### Simulation Configuration

| Parameter | JSON Path | Type | Default | Description |
|-----------|-----------|------|---------|-------------|
| Schema Version | `_schema_version` | string | `"1.0"` | Schema version identifier |
| Simulation Hours | `simulation_hours` | int | `16` | Total hours to simulate |
| Random Seed | `random_seed` | int | `42` | Seed for reproducible random streams |
| Cashier Count | `cashier_count` | int | `3` | Number of cashier counters |
| Cook Count | `cook_count` | int | `10` | Number of kitchen stations / cooks |
| Server Count | `server_count` | int | `4` | Number of release servers |
| Total Tables | `total_tables` | int | `39` | Total dining tables |
| Monitoring Interval | `monitoring_interval_minutes` | float | `1.0` | Interval (minutes) between queue/occupancy snapshot samples |

### Arrival Process

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Regular Arrival Rate | `arrival.regular_rate_per_minute` | float | `0.29` | Poisson rate (λ) during non-peak hours |
| Peak Arrival Rate | `arrival.peak_rate_per_minute` | float | `0.58` | Poisson rate (λ) during peak hours |
| Peak Windows | `arrival.peak_windows` | array | lunch (300–420), dinner (720–840) | Time windows (minutes from simulation start) when peak rates apply |

### Cashier Service Time

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Service Time Range | `cashier_service_time_range_minutes` | [float, float] | `[2.0, 7.0]` | Low/high bounds for triangular distribution |
| Service Time Mode | `cashier_service_time_mode_minutes` | float | `3.0` | Mode for triangular distribution |

### Kitchen

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Regular Prep Range | `kitchen.regular_prep_time_range_minutes` | [float, float] | `[7.0, 10.0]` | Low/high bounds for regular-hour triangular distribution |
| Regular Prep Mode | `kitchen.regular_prep_time_mode_minutes` | float | `7.0` | Mode for regular-hour triangular distribution |
| Peak Prep Range | `kitchen.peak_prep_time_range_minutes` | [float, float] | `[15.0, 20.0]` | Low/high bounds for peak-hour triangular distribution |
| Peak Prep Mode | `kitchen.peak_prep_time_mode_minutes` | float | `17.0` | Mode for peak-hour triangular distribution |
| Bottleneck Items | `kitchen.bottleneck_items` | string[] | `["Regular Chicken", "Sisig"]` | Menu items incurring extra prep time |
| Bottleneck Extra Range | `kitchen.bottleneck_extra_range_minutes` | [float, float] | `[3.0, 8.0]` | Low/high bounds for bottleneck surcharge triangular distribution |
| Bottleneck Extra Mode | `kitchen.bottleneck_extra_mode_minutes` | float | `5.0` | Mode for bottleneck surcharge triangular distribution |

### Server / Release

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Delivery Time Range | `server_delivery_time_range_minutes` | [float, float] | `[0.5, 1.0]` | Low/high bounds for uniform distribution |

### Dining

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Dining Time Range | `dining_time_range_minutes` | [float, float] | `[20.0, 50.0]` | Low/high bounds for triangular distribution |
| Dining Time Mode | `dining_time_mode_minutes` | float | `30.0` | Mode for triangular distribution |

### Customer Patience

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Patience Range | `customer_patience_range_minutes` | [float, float] | `[15.0, 60.0]` | Low/high bounds for triangular distribution |
| Patience Mode | `customer_patience_mode_minutes` | float | `30.0` | Mode for triangular distribution |

### Menu

| Parameter | JSON Path | Type | Default | Description |
|-----------|-----------|------|---------|-------------|
| Items | `menu.items` | string[] | `["Regular Chicken", "Sisig", "Chicken BBQ", "Pork BBQ", "Lumpia", "Rice", "Drink"]` | Available menu items for order generation |
| Weights | `menu.weights` | float[] | `[0.3, 0.2, 0.15, 0.1, 0.05, 0.1, 0.1]` | Selection probability weights for each menu item (must sum to 1.0) |
| Min Items | `menu.min_items` | int | `1` | Minimum items per randomly generated order |
| Max Items | `menu.max_items` | int | `3` | Maximum items per randomly generated order |

### Kiosk

| Parameter | JSON Path | Type | Default | Distribution / Notes |
|-----------|-----------|------|---------|---------------------|
| Kiosk Count | `kiosk.kiosk_count` | int | `0` | Number of self-service kiosk stations |
| Order Time Range | `kiosk.order_time_range_minutes` | [float, float] | `[1.0, 5.0]` | Low/high bounds for kiosk order placement triangular distribution |
| Order Time Mode | `kiosk.order_time_mode_minutes` | float | `2.0` | Mode for kiosk order placement triangular distribution |
| Confirm Service Range | `kiosk.confirm_service_time_range_minutes` | [float, float] | `[0.5, 1.5]` | Low/high bounds for online payment confirmation triangular distribution |
| Confirm Service Mode | `kiosk.confirm_service_time_mode_minutes` | float | `1.0` | Mode for online payment confirmation triangular distribution |
| Cash Service Range | `kiosk.cash_service_time_range_minutes` | [float, float] | `[1.0, 3.0]` | Low/high bounds for kiosk cash payment at cashier triangular distribution |
| Cash Service Mode | `kiosk.cash_service_time_mode_minutes` | float | `2.0` | Mode for kiosk cash payment at cashier triangular distribution |
| Allow Manual Override | `kiosk.allow_cashier_manual_override` | bool | `true` | Enables routing non-kiosk customers directly to cashier |
| Manual Override Probability | `kiosk.manual_override_probability` | float | `0.15` | Probability a customer bypasses kiosk for manual cashier order |
| Manual Order Range | `kiosk.manual_order_time_range_minutes` | [float, float] | `[3.0, 8.0]` | Low/high bounds for manual cashier order triangular distribution |
| Manual Order Mode | `kiosk.manual_order_time_mode_minutes` | float | `5.0` | Mode for manual cashier order triangular distribution |
| Enable Timeout | `kiosk.timeout.enable_timeout` | bool | `true` | Enables confirmation deadline for kiosk orders |
| Confirmation Time Limit | `kiosk.timeout.confirmation_time_limit_minutes` | float | `5.0` | Max minutes a kiosk order can wait for cashier confirmation before expiring |
| Accept Online Cash Apps | `kiosk.payment.accept_online_cash_apps` | bool | `true` | Accept online cash app payments at kiosk |
| Online Payment Probability | `kiosk.payment.online_payment_probability` | float | `0.5` | Probability a kiosk customer pays via online app vs. paying cash at counter |
| Supported Apps | `kiosk.payment.supported_apps` | string[] | `["GCash", "Maya"]` | Available payment apps for online kiosk payments |

### Web Dashboard / Server (hardcoded in `src/server.py`)

These parameters are not in `config.json` but control the web dashboard server:

| Parameter | Location | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| HTTP Host | `server.py:27` | string | `"0.0.0.0"` | HTTP server bind address |
| HTTP Port | `server.py:28` | int | `8000` | HTTP server port |
| WebSocket Host | `server.py:29` | string | `"0.0.0.0"` | WebSocket server bind address |
| WebSocket Port | `server.py:30` | int | `8765` | WebSocket server port |
| Rolling Window | `server.py:31` | int | `5` | Number of data points in rolling time series charts |
| Speed | `SimRunner.speed` | float | `1.0` | Simulation speed multiplier (1.0 = real-time) |
| Max Throughput | `SimRunner.max_throughput` | bool | `false` | Run simulation at maximum speed (ignores speed multiplier) |
| Paused | `SimRunner.paused` | bool | `true` | Initial paused state; simulation waits for "play" from dashboard |

### Runtime Overrides (via WebSocket `update_config`)

The web dashboard can override the following parameters at runtime via the `apply_config_overrides` method in `server.py:159`. No restart required:

| Override Key | JSON Path Overridden | Description |
|-------------|---------------------|-------------|
| `active_cashiers` | `cashier_count` | Number of active cashier counters |
| `active_kiosks` | `kiosk.kiosk_count` | Number of active kiosk stations |
| `customer_arrival_rate` | `arrival.regular_rate_per_minute` | Regular arrival rate (λ) |
| `kitchen_staff_capacity` | `cook_count` | Kitchen station count |
| `total_table_capacity` | `total_tables` | Total dining tables |
| `speed` | *(SimRunner)* | Simulation speed multiplier |
| `max_throughput` | *(SimRunner)* | Run at max speed toggle |
| `kiosk_disabled` | `kiosk.kiosk_count` (set to 0) | Temporarily disable all kiosks (saves and restores original count) |
