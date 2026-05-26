# mang-inasal-des-sim

Discrete-event simulation of a Mang Inasal restaurant branch, built with Python and SimPy.

Models the complete customer journey from arrival to departure across cashier, kitchen, and dining stages under both regular and peak-hour conditions.

## How It Works

Every customer entity flows through 7 sequential FIFO stages:

```
Arrival → Cashier Queue → Kitchen Prep → Release Claim → Seating Wait → Dining → Depart
```

Each stage is parameterized with bounded probability distributions triangulated from interview data and direct observation:

| Stage | Resource | Capacity | Distribution |
|-------|----------|----------|-------------|
| Arrival | — | — | NHPP (λ=0.29 regular, 0.58 peak) |
| Cashier | simpy.Resource | 3 counters | triangular(2, 3, 7) min |
| Kitchen | simpy.Resource | 10 stations | triangular(7, 7, 10) regular / triangular(15, 17, 20) peak + bottleneck surcharge |
| Release | — | — | uniform(0.5, 1.0) min |
| Dining | simpy.Resource | 154 tables | triangular(20, 30, 50) min |

Peak hours (11AM–1PM lunch, 6PM–8PM dinner) increase both arrival rate and kitchen prep times. "Regular Chicken" and "Sisig" orders incur extra prep time.

The simulation tracks 13 KPIs: average queue lengths, waiting times per stage, table occupancy, hourly throughput, and total customers served.

## Architecture

```
src/
├── config.py         — All simulation parameters (frozen dataclass)
├── metrics.py        — Metrics collector & reporter
├── main.py           — Entry point
├── entities/         — Resource wrappers
│   ├── customer.py   — Customer state & timestamps
│   ├── cashier.py    — CashierManager (3 counters)
│   ├── kitchen.py    — KitchenManager (10 stations, dynamic prep)
│   └── dining.py     — TableManager (154 tables)
└── engine/           — SimPy process generators
    ├── arrivals.py   — NHPP arrival generator
    ├── lifecycle.py  — 7-step customer lifecycle
    └── monitor.py    — Periodic KPI snapshots
```

## Prerequisites

- Python 3.10+
- [SimPy](https://simpy.readthedocs.io/) 4.x

## Setup & Run

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install simpy
python -m src.main
```

Expected output:
```
=======================================================
  MANG INASAL SIMULATION -- DAILY REPORT
=======================================================
  avg_cashier_wait_min               :       0.43
  max_cashier_wait_min               :       7.17
  avg_kitchen_wait_min               :       3.31
  ...
  total_customers_served             :     322.00
  hourly_throughput                  :      20.12
=======================================================
```

## Configuration

Edit `src/config.py` to adjust arrival rates, resource capacities, distribution bounds, or peak hour windows. All parameters are in a single `Config` frozen dataclass.
