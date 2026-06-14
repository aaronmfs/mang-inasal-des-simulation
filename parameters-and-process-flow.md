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

Peak hours (11AM–1PM lunch, 6PM–8PM dinner) increase both arrival rate and kitchen prep times. "Regular Chicken" and "Sisig" orders incur extra prep time.

Customers have configurable patience limits: if wait time exceeds their sampled patience (triangular(15, 30, 60) min), they abandon the queue. Feature flags toggle patience, the server resource bottleneck, and the kiosk-first workflow independently.

## Parameter Reference

All simulation parameters are externalized to `config.json` — no hardcoded values in source code. The `Config` class in `src/config.py` loads this file at runtime and exposes each value via typed properties and distribution helper methods.

| Type | Name | Description and Unit | Distribution / Value |
| :--- | :--- | :--- | :--- |
| Stochastic process | Arrival Process | Customer inter-arrival times following a non-homogeneous Poisson process; peak windows in minutes from simulation start | NHPP λ=0.29 (regular), 0.58 (peak); peak windows: [300, 420] lunch, [720, 840] dinner |
| Service distribution | Kiosk Service Time | Order placement time at self-service kiosk (minutes) | triangular(1, 2, 5); resource: simpy.Resource, capacity: kiosk.kiosk_count |
| Service distribution | Cashier Service Time | Order and payment processing at cashier counter (minutes) | triangular(2, 3, 7) (full order); triangular(0.5, 1, 1.5) (kiosk confirm); resource: simpy.Resource, capacity: cashier_count (default 3) |
| Service distribution | Kitchen Prep Time | Food preparation time (minutes) | regular: triangular(7, 7, 10); peak: triangular(15, 17, 20); + bottleneck surcharge triangular(3, 5, 8) for Regular Chicken / Sisig; resource: simpy.Resource, capacity: cook_count (default 10) |
| Service distribution | Release Service Time | Food release / claim time (minutes) | uniform(0.5, 1.0); resource: simpy.Resource (optional), capacity: server_count (default 4) |
| Service distribution | Dining Time | Time spent dining at table (minutes) | triangular(20, 30, 50); resource: simpy.Resource, capacity: total_tables (default 39) |
| Service distribution | Customer Patience Tolerance | Max wait time before abandoning queue (minutes) | triangular(15, 30, 60) |
| Feature flag | Customer Patience | Enables queue abandonment when wait exceeds sampled patience | JSON: `features.customer_patience_and_abandonment`, bool, default: `true` |
| Feature flag | Server Bottleneck | Release stage requires a server resource (capacity = server_count) | JSON: `features.server_resource_bottleneck`, bool, default: `true` |
| Feature flag | Kiosk Experimental Mode | Enables kiosk-first workflow (kiosk → cashier confirm) | JSON: `features.kiosk_experimental_mode`, bool, default: `true` |
| Input parameter | Schema Version | Schema version identifier | JSON: `_schema_version`, string, default: `"1.0"` |
| Input parameter | Simulation Hours | Total hours to simulate | JSON: `simulation_hours`, int, default: `16` |
| Input parameter | Random Seed | Seed for reproducible random streams | JSON: `random_seed`, int, default: `42` |
| Input parameter | Cashier Count | Number of cashier counters | JSON: `cashier_count`, int, default: `3` |
| Input parameter | Cook Count | Number of kitchen stations / cooks | JSON: `cook_count`, int, default: `10` |
| Input parameter | Server Count | Number of release servers | JSON: `server_count`, int, default: `4` |
| Input parameter | Total Tables | Total dining tables | JSON: `total_tables`, int, default: `39` |
| Input parameter | Monitoring Interval | Interval between queue / occupancy snapshot samples (minutes) | JSON: `monitoring_interval_minutes`, float, default: `1.0` |
| Input parameter | Regular Arrival Rate | Poisson arrival rate (λ) during non-peak hours | JSON: `arrival.regular_rate_per_minute`, float, default: `0.29` |
| Input parameter | Peak Arrival Rate | Poisson arrival rate (λ) during peak hours | JSON: `arrival.peak_rate_per_minute`, float, default: `0.58` |
| Input parameter | Peak Windows | Time windows (minutes from simulation start) when peak rates apply | JSON: `arrival.peak_windows`, array, default: lunch (300–420), dinner (720–840) |
| Input parameter | Cashier Service Time Range | Low / high bounds for cashier service time triangular distribution (minutes) | JSON: `cashier_service_time_range_minutes`, [float, float], default: `[2.0, 7.0]` |
| Input parameter | Cashier Service Time Mode | Mode for cashier service time triangular distribution (minutes) | JSON: `cashier_service_time_mode_minutes`, float, default: `3.0` |
| Input parameter | Kitchen Regular Prep Range | Low / high bounds for regular-hour triangular distribution (minutes) | JSON: `kitchen.regular_prep_time_range_minutes`, [float, float], default: `[7.0, 10.0]` |
| Input parameter | Kitchen Regular Prep Mode | Mode for regular-hour triangular distribution (minutes) | JSON: `kitchen.regular_prep_time_mode_minutes`, float, default: `7.0` |
| Input parameter | Kitchen Peak Prep Range | Low / high bounds for peak-hour triangular distribution (minutes) | JSON: `kitchen.peak_prep_time_range_minutes`, [float, float], default: `[15.0, 20.0]` |
| Input parameter | Kitchen Peak Prep Mode | Mode for peak-hour triangular distribution (minutes) | JSON: `kitchen.peak_prep_time_mode_minutes`, float, default: `17.0` |
| Input parameter | Bottleneck Items | Menu items incurring extra prep time | JSON: `kitchen.bottleneck_items`, string[], default: `["Regular Chicken", "Sisig"]` |
| Input parameter | Bottleneck Extra Range | Low / high bounds for bottleneck surcharge triangular distribution (minutes) | JSON: `kitchen.bottleneck_extra_range_minutes`, [float, float], default: `[3.0, 8.0]` |
| Input parameter | Bottleneck Extra Mode | Mode for bottleneck surcharge triangular distribution (minutes) | JSON: `kitchen.bottleneck_extra_mode_minutes`, float, default: `5.0` |
| Input parameter | Release Delivery Time Range | Low / high bounds for uniform distribution of release server time (minutes) | JSON: `server_delivery_time_range_minutes`, [float, float], default: `[0.5, 1.0]` |
| Input parameter | Dining Time Range | Low / high bounds for dining triangular distribution (minutes) | JSON: `dining_time_range_minutes`, [float, float], default: `[20.0, 50.0]` |
| Input parameter | Dining Time Mode | Mode for dining triangular distribution (minutes) | JSON: `dining_time_mode_minutes`, float, default: `30.0` |
| Input parameter | Customer Patience Range | Low / high bounds for patience triangular distribution (minutes) | JSON: `customer_patience_range_minutes`, [float, float], default: `[15.0, 60.0]` |
| Input parameter | Customer Patience Mode | Mode for patience triangular distribution (minutes) | JSON: `customer_patience_mode_minutes`, float, default: `30.0` |
| Input parameter | Menu Items | Available menu items for order generation | JSON: `menu.items`, string[], default: `["Regular Chicken", "Sisig", "Chicken BBQ", "Pork BBQ", "Lumpia", "Rice", "Drink"]` |
| Input parameter | Menu Weights | Selection probability weights for each menu item (must sum to 1.0) | JSON: `menu.weights`, float[], default: `[0.3, 0.2, 0.15, 0.1, 0.05, 0.1, 0.1]` |
| Input parameter | Min Items Per Order | Minimum items per randomly generated order | JSON: `menu.min_items`, int, default: `1` |
| Input parameter | Max Items Per Order | Maximum items per randomly generated order | JSON: `menu.max_items`, int, default: `3` |
| Input parameter | Kiosk Count | Number of self-service kiosk stations | JSON: `kiosk.kiosk_count`, int, default: `0` |
| Input parameter | Kiosk Order Time Range | Low / high bounds for kiosk order placement triangular distribution (minutes) | JSON: `kiosk.order_time_range_minutes`, [float, float], default: `[1.0, 5.0]` |
| Input parameter | Kiosk Order Time Mode | Mode for kiosk order placement triangular distribution (minutes) | JSON: `kiosk.order_time_mode_minutes`, float, default: `2.0` |
| Input parameter | Kiosk Confirm Service Range | Low / high bounds for online payment confirmation triangular distribution (minutes) | JSON: `kiosk.confirm_service_time_range_minutes`, [float, float], default: `[0.5, 1.5]` |
| Input parameter | Kiosk Confirm Service Mode | Mode for online payment confirmation triangular distribution (minutes) | JSON: `kiosk.confirm_service_time_mode_minutes`, float, default: `1.0` |
| Input parameter | Kiosk Cash Service Range | Low / high bounds for kiosk cash payment at cashier triangular distribution (minutes) | JSON: `kiosk.cash_service_time_range_minutes`, [float, float], default: `[1.0, 3.0]` |
| Input parameter | Kiosk Cash Service Mode | Mode for kiosk cash payment at cashier triangular distribution (minutes) | JSON: `kiosk.cash_service_time_mode_minutes`, float, default: `2.0` |
| Input parameter | Allow Manual Override | Enables routing non-kiosk customers directly to cashier | JSON: `kiosk.allow_cashier_manual_override`, bool, default: `true` |
| Input parameter | Manual Override Probability | Probability a customer bypasses kiosk for manual cashier order | JSON: `kiosk.manual_override_probability`, float, default: `0.15` |
| Input parameter | Manual Order Range | Low / high bounds for manual cashier order triangular distribution (minutes) | JSON: `kiosk.manual_order_time_range_minutes`, [float, float], default: `[3.0, 8.0]` |
| Input parameter | Manual Order Mode | Mode for manual cashier order triangular distribution (minutes) | JSON: `kiosk.manual_order_time_mode_minutes`, float, default: `5.0` |
| Input parameter | Enable Kiosk Timeout | Enables confirmation deadline for kiosk orders | JSON: `kiosk.timeout.enable_timeout`, bool, default: `true` |
| Input parameter | Confirmation Time Limit | Max minutes a kiosk order can wait for cashier confirmation before expiring | JSON: `kiosk.timeout.confirmation_time_limit_minutes`, float, default: `5.0` |
| Input parameter | Accept Online Cash Apps | Accept online cash app payments at kiosk | JSON: `kiosk.payment.accept_online_cash_apps`, bool, default: `true` |
| Input parameter | Online Payment Probability | Probability a kiosk customer pays via online app vs. cash at counter | JSON: `kiosk.payment.online_payment_probability`, float, default: `0.5` |
| Input parameter | Supported Payment Apps | Available payment apps for online kiosk payments | JSON: `kiosk.payment.supported_apps`, string[], default: `["GCash", "Maya"]` |
| Input parameter | HTTP Host | HTTP server bind address | Location: `server.py:27`, string, default: `"0.0.0.0"` |
| Input parameter | HTTP Port | HTTP server port | Location: `server.py:28`, int, default: `8000` |
| Input parameter | WebSocket Host | WebSocket server bind address | Location: `server.py:29`, string, default: `"0.0.0.0"` |
| Input parameter | WebSocket Port | WebSocket server port | Location: `server.py:30`, int, default: `8765` |
| Input parameter | Rolling Window | Number of data points in rolling time series charts | Location: `server.py:31`, int, default: `5` |
| Input parameter | Simulation Speed | Simulation speed multiplier (1.0 = real-time) | Location: `SimRunner.speed`, float, default: `1.0` |
| Input parameter | Max Throughput | Run simulation at maximum speed (ignores speed multiplier) | Location: `SimRunner.max_throughput`, bool, default: `false` |
| Input parameter | Initial Paused State | Initial paused state; simulation waits for play from dashboard | Location: `SimRunner.paused`, bool, default: `true` |
| Runtime override | active_cashiers | Number of active cashier counters | Overrides JSON: `cashier_count` |
| Runtime override | active_kiosks | Number of active kiosk stations | Overrides JSON: `kiosk.kiosk_count` |
| Runtime override | customer_arrival_rate | Regular arrival rate (λ) | Overrides JSON: `arrival.regular_rate_per_minute` |
| Runtime override | kitchen_staff_capacity | Kitchen station count | Overrides JSON: `cook_count` |
| Runtime override | total_table_capacity | Total dining tables | Overrides JSON: `total_tables` |
| Runtime override | speed | Simulation speed multiplier | Overrides `SimRunner.speed` |
| Runtime override | max_throughput | Run at max speed toggle | Overrides `SimRunner.max_throughput` |
| Runtime override | kiosk_disabled | Temporarily disable all kiosks (saves and restores original count) | Sets JSON: `kiosk.kiosk_count` to 0 |
