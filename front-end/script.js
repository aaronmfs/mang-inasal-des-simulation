(function () {
  'use strict';

  // ============================================================
  // Constants
  // ============================================================
  const WS_URL = 'ws://' + location.hostname + ':8765';
  const ROLLING_WINDOW_MINUTES = 5;
  const MAX_SAMPLES = 500;

  const VALIDATION = {
    active_cashiers: { min: 1, max: 10, label: 'Cashiers' },
    customer_arrival_rate: { min: 0.1, max: 5.0, label: 'Arrival Rate (per min)' }
  };

  // ============================================================
  // Utility Helpers
  // ============================================================
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  function maxVal(arr) { return arr.length ? Math.max.apply(null, arr) : 0; }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function formatTime(minute, use24hr, startHour, startMinute) {
    startHour = startHour || 9;
    startMinute = startMinute || 0;
    var totalMinutes = startHour * 60 + startMinute + minute;
    var h = Math.floor(totalMinutes / 60) % 24;
    var m = Math.floor(totalMinutes % 60);
    var mm = m < 10 ? '0' + m : '' + m;
    if (use24hr) {
      var hh = h < 10 ? '0' + h : '' + h;
      return hh + ':' + mm;
    }
    var ampm = h < 12 ? ' AM' : ' PM';
    var dh = h % 12 === 0 ? 12 : h % 12;
    return dh + ':' + mm + ampm;
  }

  function getBinIndex(val) {
    if (val < 1) return 0;
    if (val < 2) return 1;
    if (val < 3) return 2;
    if (val < 4) return 3;
    if (val < 5) return 4;
    if (val < 6) return 5;
    if (val < 8) return 6;
    if (val < 10) return 7;
    if (val < 15) return 8;
    if (val < 20) return 9;
    return 10;
  }

  function computeHistogram(samples) {
    var bins = new Array(11).fill(0);
    for (var i = 0; i < samples.length; i++) {
      bins[getBinIndex(samples[i])]++;
    }
    return bins;
  }

  // ============================================================
  // Tween Engine — interpolation layer for smooth rendering
  // ============================================================
  function TweenEngine() {
    this.enabled = true;
    this.targets = {};
    this.current = {};
    this.speed = 0.08;
    this._animId = null;
    this._listeners = [];
  }

  TweenEngine.prototype.set = function (key, value) {
    this.targets[key] = value;
    if (!(key in this.current)) {
      this.current[key] = value;
    }
  };

  TweenEngine.prototype.get = function (key) {
    if (!this.enabled) return this.targets[key] !== undefined ? this.targets[key] : 0;
    return this.current[key] !== undefined ? this.current[key] : 0;
  };

  TweenEngine.prototype.bulkSet = function (obj) {
    var k;
    for (k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        this.set(k, obj[k]);
      }
    }
  };

  TweenEngine.prototype.onFrame = function (fn) {
    this._listeners.push(fn);
  };

  TweenEngine.prototype._tick = function () {
    var k, diff;
    if (this.enabled) {
      for (k in this.targets) {
        if (Object.prototype.hasOwnProperty.call(this.targets, k)) {
          if (this.current[k] === undefined) this.current[k] = 0;
          diff = this.targets[k] - this.current[k];
          this.current[k] += diff * this.speed;
          if (Math.abs(diff) < 0.001) this.current[k] = this.targets[k];
        }
      }
    } else {
      for (k in this.targets) {
        if (Object.prototype.hasOwnProperty.call(this.targets, k)) {
          this.current[k] = this.targets[k];
        }
      }
    }
    for (var i = 0; i < this._listeners.length; i++) {
      this._listeners[i]();
    }
    this._animId = requestAnimationFrame(this._boundTick);
  };

  TweenEngine.prototype.start = function () {
    if (this._animId) return;
    this._boundTick = this._tick.bind(this);
    this._boundTick();
  };

  TweenEngine.prototype.stop = function () {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  };

  // ============================================================
  // Simulation Config (JSON Schema, mirrors backend config.json)
  // ============================================================
  var SIM_CONFIG = {
    _schema_version: '1.0',
    features: {
      customer_patience_and_abandonment: true,
      server_resource_bottleneck: true,
      kiosk_experimental_mode: true
    },
    kiosk: {
      kiosk_count: 0,
      order_time_range_minutes: [1.0, 5.0],
      order_time_mode_minutes: 2.0,
      confirm_service_time_range_minutes: [0.5, 1.5],
      confirm_service_time_mode_minutes: 1.0,
      cash_service_time_range_minutes: [1.0, 3.0],
      cash_service_time_mode_minutes: 2.0,
      allow_cashier_manual_override: true,
      manual_override_probability: 0.15,
      manual_order_time_range_minutes: [3.0, 8.0],
      manual_order_time_mode_minutes: 5.0,
      timeout: {
        enable_timeout: true,
        confirmation_time_limit_minutes: 5
      },
      payment: {
        accept_online_cash_apps: true,
        supported_apps: ['GCash', 'Maya']
      }
    },
    simulation_hours: 16,
    random_seed: 42,
    cashier_count: 3,
    cook_count: 10,
    server_count: 4,
    total_tables: 39,
    arrival: {
      regular_rate_per_minute: 0.29,
      peak_rate_per_minute: 0.58,
      peak_windows: [
        { label: 'lunch', start_minute: 300, end_minute: 420 },
        { label: 'dinner', start_minute: 720, end_minute: 840 }
      ]
    },
    cashier_service_time_range_minutes: [2.0, 7.0],
    cashier_service_time_mode_minutes: 3.0,
    kitchen: {
      regular_prep_time_range_minutes: [7.0, 10.0],
      regular_prep_time_mode_minutes: 7.0,
      peak_prep_time_range_minutes: [15.0, 20.0],
      peak_prep_time_mode_minutes: 17.0,
      bottleneck_items: ['Regular Chicken', 'Sisig'],
      bottleneck_extra_range_minutes: [3.0, 8.0],
      bottleneck_extra_mode_minutes: 5.0
    },
    server_delivery_time_range_minutes: [0.5, 1.0],
    dining_time_range_minutes: [20.0, 50.0],
    dining_time_mode_minutes: 30.0,
    customer_patience_range_minutes: [15.0, 60.0],
    customer_patience_mode_minutes: 30.0,
    menu: {
      items: ['Regular Chicken', 'Sisig', 'Chicken BBQ', 'Pork BBQ', 'Lumpia', 'Rice', 'Drink'],
      weights: [0.3, 0.2, 0.15, 0.1, 0.05, 0.1, 0.1]
    }
  };

  // ============================================================
  // Client-side Simulation Engine (fallback / demo mode)
  // ============================================================
  function MangInasalSim(overrides) {
    this.config = JSON.parse(JSON.stringify(SIM_CONFIG));
    this._kioskOrderProb = 0;
    this._dineInProb = 0.8;
    this.applyOverrides(overrides || {});
    this.resetState();
  }

  MangInasalSim.prototype.applyOverrides = function (overrides) {
    if (overrides.cashier_count !== undefined) this.config.cashier_count = overrides.cashier_count;
    if (overrides.kiosk_count !== undefined) this.config.kiosk.kiosk_count = overrides.kiosk_count;
    if (overrides.regular_rate_per_minute !== undefined) this.config.arrival.regular_rate_per_minute = overrides.regular_rate_per_minute;
    if (overrides.cook_count !== undefined) this.config.cook_count = overrides.cook_count;
    if (overrides.total_tables !== undefined) this.config.total_tables = overrides.total_tables;
    if (overrides.kiosk_order_prob !== undefined) this._kioskOrderProb = overrides.kiosk_order_prob;
    if (overrides.dine_in_prob !== undefined) this._dineInProb = overrides.dine_in_prob;
  };

  MangInasalSim.prototype.resetState = function () {
    var c = this.config;
    this.currentMinute = 0;
    this.customersServed = 0;
    this.customersLost = 0;
    this.totalHoursSimulated = 0;

    this.cashierBusy = new Array(c.cashier_count).fill(0);
    this.kioskBusy = new Array(c.kiosk.kiosk_count).fill(0);
    this.kitchenBusy = new Array(c.cook_count).fill(0);
    this.serverBusy = new Array(c.server_count).fill(0);
    this.tableOccupied = 0;
    this.tableTimers = [];

    this.cashierQueue = [];
    this.kitchenQueue = [];
    this.serverQueue = [];
    this.tableQueue = [];

    this.cashierWaitSamples = [];
    this.kitchenWaitSamples = [];
    this.tableWaitSamples = [];
    this.cashierServiceTimes = [];
    this.kioskOrderTimes = [];
    this.diningTimes = [];
    this.systemTimes = [];

    this.timeSeriesUtil = [];
    this.timeSeriesOccupancy = [];
    this.timeSeriesMaxOccupancy = [];
    this.timeLabels = [];

    this.manualOrders = 0;
    this.kioskCreated = 0;
    this.kioskOnline = 0;
    this.kioskCash = 0;
    this.timeouts = 0;

    this.queueLenSum = 0;
    this.queueLenCount = 0;
    this.maxQueueLen = 0;
    this.occupancySum = 0;
    this.occupancyCount = 0;
    this.maxOccupancyEver = 0;

    this.nextId = 1;
    this._activeKitchenOrders = [];
    this._activeServerOrders = [];
    this._activeKioskOrders = [];

    this._allTimeMax = {
      cashierQueueLen: 0,
      tableOccupancy: 0,
      tableUtilPct: 0
    };
  };

  MangInasalSim.prototype.sampleFromRangeMode = function (range, mode) {
    var a = range[0], b = range[1];
    var raw = a + Math.random() * (b - a);
    var mix = (mode - a) / (b - a);
    var r = Math.random();
    if (r < mix) return a + Math.sqrt(r * mix) * (mode - a);
    return mode + Math.sqrt((1 - r) * (1 - mix)) * (b - mode);
  };

  MangInasalSim.prototype.isPeak = function (minute) {
    var windows = this.config.arrival.peak_windows;
    for (var i = 0; i < windows.length; i++) {
      if (minute >= windows[i].start_minute && minute < windows[i].end_minute) return true;
    }
    return false;
  };

  MangInasalSim.prototype.poisson = function (mean) {
    if (mean <= 0) return 0;
    var L = Math.exp(-mean);
    var k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  };

  MangInasalSim.prototype.tick = function () {
    var c = this.config;
    this.currentMinute++;
    var minute = this.currentMinute;

    // Arrivals
    var rate = this.isPeak(minute) ? c.arrival.peak_rate_per_minute : c.arrival.regular_rate_per_minute;
    var arrivals = this.poisson(rate);
    for (var i = 0; i < arrivals; i++) {
      var isKiosk = c.kiosk.kiosk_count > 0 && Math.random() < (this._kioskOrderProb || 0.87);
      var dineIn = Math.random() < (this._dineInProb || 0.8);
      var patience = this.sampleFromRangeMode(c.customer_patience_range_minutes, c.customer_patience_mode_minutes);
      var cust = {
        id: this.nextId++,
        arrivalMinute: minute,
        isKiosk: isKiosk,
        dineIn: dineIn,
        patience: patience,
        lost: false
      };
      if (isKiosk) {
        this.processKioskArrival(cust);
      } else {
        this.processManualArrival(cust);
      }
    }

    this.updateCashiers(minute);
    this.updateKiosks(minute);
    this.updateKitchen(minute);
    this.updateServers(minute);
    this.updateTables(minute);

    this.totalHoursSimulated = minute / 60;
    var currentQueueLen = this.cashierQueue.length + this.cashierBusy.filter(function (t) { return t > 0; }).length;
    this.queueLenSum += currentQueueLen;
    this.queueLenCount++;
    if (currentQueueLen > this.maxQueueLen) this.maxQueueLen = currentQueueLen;
    this.occupancySum += this.tableOccupied;
    this.occupancyCount++;
    if (this.tableOccupied > this.maxOccupancyEver) this.maxOccupancyEver = this.tableOccupied;

    if (currentQueueLen > this._allTimeMax.cashierQueueLen) this._allTimeMax.cashierQueueLen = currentQueueLen;
    if (this.tableOccupied > this._allTimeMax.tableOccupancy) this._allTimeMax.tableOccupancy = this.tableOccupied;
    var utilPct = (this.tableOccupied / c.total_tables) * 100;
    if (utilPct > this._allTimeMax.tableUtilPct) this._allTimeMax.tableUtilPct = utilPct;

    this.timeSeriesUtil.push(utilPct);
    this.timeSeriesOccupancy.push(this.tableOccupied);
    this.timeSeriesMaxOccupancy.push(this.maxOccupancyEver);
    this.timeLabels.push(minute);
    var maxPoints = ROLLING_WINDOW_MINUTES;
    while (this.timeSeriesUtil.length > maxPoints) {
      this.timeSeriesUtil.shift();
      this.timeSeriesOccupancy.shift();
      this.timeSeriesMaxOccupancy.shift();
      this.timeLabels.shift();
    }

    var arr, keys = ['cashierWaitSamples','kitchenWaitSamples','tableWaitSamples','cashierServiceTimes','kioskOrderTimes','diningTimes','systemTimes'];
    for (var ki = 0; ki < keys.length; ki++) {
      arr = this[keys[ki]];
      if (arr.length > MAX_SAMPLES) this[keys[ki]] = arr.slice(-MAX_SAMPLES);
    }
  };

  MangInasalSim.prototype.processKioskArrival = function (cust) {
    this.kioskCreated++;
    var freeIdx = -1;
    for (var i = 0; i < this.kioskBusy.length; i++) {
      if (this.kioskBusy[i] <= 0) { freeIdx = i; break; }
    }
    if (freeIdx === -1) { this.customersLost++; return; }
    var orderTime = this.sampleFromRangeMode(this.config.kiosk.order_time_range_minutes, this.config.kiosk.order_time_mode_minutes);
    this.kioskBusy[freeIdx] = orderTime;
    this.kioskOrderTimes.push(orderTime);
    cust._kioskIdx = freeIdx;
    cust._orderEndMinute = this.currentMinute + orderTime;
    this._activeKioskOrders.push(cust);
  };

  MangInasalSim.prototype.processManualArrival = function (cust) {
    this.manualOrders++;
    var freeCashier = -1;
    for (var i = 0; i < this.cashierBusy.length; i++) {
      if (this.cashierBusy[i] <= 0) { freeCashier = i; break; }
    }
    if (freeCashier !== -1) {
      var serviceTime = this.sampleFromRangeMode(this.config.cashier_service_time_range_minutes, this.config.cashier_service_time_mode_minutes);
      this.cashierBusy[freeCashier] = serviceTime;
      this.cashierWaitSamples.push(0);
      this.cashierServiceTimes.push(serviceTime);
      this.kitchenQueue.push({ id: cust.id, arrivalMinute: cust.arrivalMinute, dineIn: cust.dineIn, patience: cust.patience, orderTime: this.currentMinute + serviceTime });
    } else {
      this.cashierQueue.push({ id: cust.id, arrivalMinute: cust.arrivalMinute, dineIn: cust.dineIn, patience: cust.patience, queueEntryTime: this.currentMinute });
    }
  };

  MangInasalSim.prototype.updateCashiers = function (minute) {
    for (var i = 0; i < this.cashierBusy.length; i++) {
      if (this.cashierBusy[i] > 0) {
        this.cashierBusy[i] = Math.max(0, this.cashierBusy[i] - 1);
        if (this.cashierBusy[i] <= 0 && this.cashierQueue.length > 0) {
          var next = this.cashierQueue.shift();
          var wait = minute - next.queueEntryTime;
          if (wait > next.patience) { this.customersLost++; continue; }
          this.cashierWaitSamples.push(wait);
          var serviceTime = this.sampleFromRangeMode(this.config.cashier_service_time_range_minutes, this.config.cashier_service_time_mode_minutes);
          this.cashierBusy[i] = serviceTime;
          this.cashierServiceTimes.push(serviceTime);
          this.kitchenQueue.push({ id: next.id, arrivalMinute: next.arrivalMinute, dineIn: next.dineIn, patience: next.patience, orderTime: minute + serviceTime });
        }
      }
    }
    for (var j = this.cashierQueue.length - 1; j >= 0; j--) {
      if (minute - this.cashierQueue[j].queueEntryTime > this.cashierQueue[j].patience) {
        this.cashierQueue.splice(j, 1);
        this.customersLost++;
      }
    }
  };

  MangInasalSim.prototype.updateKiosks = function (minute) {
    for (var i = this._activeKioskOrders.length - 1; i >= 0; i--) {
      var cust = this._activeKioskOrders[i];
      var idx = cust._kioskIdx;
      if (this.kioskBusy[idx] <= 0) {
        this._activeKioskOrders.splice(i, 1);
        var payOnline = Math.random() < 0.5;
        if (payOnline) {
          var confirmTime = this.sampleFromRangeMode(this.config.kiosk.confirm_service_time_range_minutes, this.config.kiosk.confirm_service_time_mode_minutes);
          if (this.config.kiosk.timeout.enable_timeout && confirmTime > this.config.kiosk.timeout.confirmation_time_limit_minutes) {
            this.timeouts++;
            this.customersLost++;
          } else {
            this.kioskOnline++;
            this.kitchenQueue.push({ id: cust.id, arrivalMinute: cust.arrivalMinute, dineIn: cust.dineIn, patience: cust.patience, orderTime: minute + confirmTime });
          }
        } else {
          var cashTime = this.sampleFromRangeMode(this.config.kiosk.cash_service_time_range_minutes, this.config.kiosk.cash_service_time_mode_minutes);
          this.kioskCash++;
          this.kitchenQueue.push({ id: cust.id, arrivalMinute: cust.arrivalMinute, dineIn: cust.dineIn, patience: cust.patience, orderTime: minute + cashTime });
        }
      }
    }
  };

  MangInasalSim.prototype.updateKitchen = function (minute) {
    var c = this.config;
    while (this.kitchenQueue.length > 0) {
      var hasFree = false;
      for (var fi = 0; fi < this.kitchenBusy.length; fi++) {
        if (this.kitchenBusy[fi] <= 0) { hasFree = true; break; }
      }
      if (!hasFree) break;
      var order = this.kitchenQueue.shift();
      var freeIdx = -1;
      for (var fi2 = 0; fi2 < this.kitchenBusy.length; fi2++) {
        if (this.kitchenBusy[fi2] <= 0) { freeIdx = fi2; break; }
      }
      var isPeak = this.isPeak(minute);
      var prepTime = isPeak
        ? this.sampleFromRangeMode(c.kitchen.peak_prep_time_range_minutes, c.kitchen.peak_prep_time_mode_minutes)
        : this.sampleFromRangeMode(c.kitchen.regular_prep_time_range_minutes, c.kitchen.regular_prep_time_mode_minutes);
      var bottleneckProb = c.menu.weights[0] + c.menu.weights[1];
      if (Math.random() < bottleneckProb) {
        prepTime += this.sampleFromRangeMode(c.kitchen.bottleneck_extra_range_minutes, c.kitchen.bottleneck_extra_mode_minutes);
      }
      this.kitchenBusy[freeIdx] = prepTime;
      var kitchenWait = minute - order.orderTime;
      if (kitchenWait >= 0) this.kitchenWaitSamples.push(kitchenWait);
      order._kitchenIdx = freeIdx;
      order._prepEndMinute = minute + prepTime;
      this._activeKitchenOrders.push(order);
    }
    for (var i = this._activeKitchenOrders.length - 1; i >= 0; i--) {
      var o = this._activeKitchenOrders[i];
      var kidx = o._kitchenIdx;
      if (this.kitchenBusy[kidx] > 0) this.kitchenBusy[kidx] = Math.max(0, this.kitchenBusy[kidx] - 1);
      if (this.kitchenBusy[kidx] <= 0) {
        this._activeKitchenOrders.splice(i, 1);
        if (o.dineIn) {
          this.serverQueue.push({ id: o.id, arrivalMinute: o.arrivalMinute, patience: o.patience, readyMinute: minute });
        } else {
          var sysTime = minute - o.arrivalMinute;
          this.systemTimes.push(sysTime);
          this.customersServed++;
        }
      }
    }
  };

  MangInasalSim.prototype.updateServers = function (minute) {
    while (this.serverQueue.length > 0) {
      var hasFree = false;
      for (var fi = 0; fi < this.serverBusy.length; fi++) {
        if (this.serverBusy[fi] <= 0) { hasFree = true; break; }
      }
      if (!hasFree) break;
      var order = this.serverQueue.shift();
      var freeIdx = -1;
      for (var fi2 = 0; fi2 < this.serverBusy.length; fi2++) {
        if (this.serverBusy[fi2] <= 0) { freeIdx = fi2; break; }
      }
      var deliveryTime = this.sampleFromRangeMode(this.config.server_delivery_time_range_minutes, 0.75);
      this.serverBusy[freeIdx] = deliveryTime;
      order._serverIdx = freeIdx;
      order._deliveryEnd = minute + deliveryTime;
      this._activeServerOrders.push(order);
    }
    for (var i = this._activeServerOrders.length - 1; i >= 0; i--) {
      var o = this._activeServerOrders[i];
      var sidx = o._serverIdx;
      if (this.serverBusy[sidx] > 0) this.serverBusy[sidx] = Math.max(0, this.serverBusy[sidx] - 1);
      if (this.serverBusy[sidx] <= 0) {
        this._activeServerOrders.splice(i, 1);
        if (this.tableOccupied < this.config.total_tables) {
          this.tableOccupied++;
          var diningTime = this.sampleFromRangeMode(this.config.dining_time_range_minutes, this.config.dining_time_mode_minutes);
          this.tableTimers.push(diningTime);
          this.diningTimes.push(diningTime);
          this.tableWaitSamples.push(0);
          var sysTime = minute - o.arrivalMinute;
          this.systemTimes.push(sysTime);
          this.customersServed++;
        } else {
          this.tableQueue.push({ id: o.id, arrivalMinute: o.arrivalMinute, patience: o.patience, tableWaitStart: minute });
        }
      }
    }
  };

  MangInasalSim.prototype.updateTables = function (minute) {
    for (var i = this.tableTimers.length - 1; i >= 0; i--) {
      this.tableTimers[i] = Math.max(0, this.tableTimers[i] - 1);
      if (this.tableTimers[i] <= 0) {
        this.tableTimers.splice(i, 1);
        this.tableOccupied = Math.max(0, this.tableOccupied - 1);
        if (this.tableQueue.length > 0 && this.tableOccupied < this.config.total_tables) {
          var next = this.tableQueue.shift();
          var waitTable = minute - next.tableWaitStart;
          if (waitTable > next.patience) { this.customersLost++; continue; }
          this.tableWaitSamples.push(waitTable);
          this.tableOccupied++;
          var diningTime = this.sampleFromRangeMode(this.config.dining_time_range_minutes, this.config.dining_time_mode_minutes);
          this.tableTimers.push(diningTime);
          this.diningTimes.push(diningTime);
          var sysTime = minute - next.arrivalMinute;
          this.systemTimes.push(sysTime);
          this.customersServed++;
        }
      }
    }
    for (var j = this.tableQueue.length - 1; j >= 0; j--) {
      if (minute - this.tableQueue[j].tableWaitStart > this.tableQueue[j].patience) {
        this.tableQueue.splice(j, 1);
        this.customersLost++;
      }
    }
  };

  MangInasalSim.prototype.getMetrics = function () {
    var avgCashierQueue = this.queueLenCount > 0 ? this.queueLenSum / this.queueLenCount : 0;
    var avgOccupancy = this.occupancyCount > 0 ? this.occupancySum / this.occupancyCount : 0;
    var throughput = this.totalHoursSimulated > 0 ? this.customersServed / this.totalHoursSimulated : 0;
    return {
      total_customers_served: this.customersServed,
      total_customers_lost: this.customersLost,
      total_hours_simulated: this.totalHoursSimulated,
      current_minute: this.currentMinute,
      hourly_throughput: throughput,
      avg_cashier_queue_len: avgCashierQueue,
      max_cashier_queue_len: this.maxQueueLen,
      kiosk_orders_created: this.kioskCreated,
      kiosk_online_confirmations: this.kioskOnline,
      kiosk_cash_payments: this.kioskCash,
      manual_orders_count: this.manualOrders,
      confirmation_timeouts: this.timeouts,
      avg_cashier_wait_min: avg(this.cashierWaitSamples),
      max_cashier_wait_min: maxVal(this.cashierWaitSamples),
      avg_kitchen_wait_min: avg(this.kitchenWaitSamples),
      max_kitchen_wait_min: maxVal(this.kitchenWaitSamples),
      avg_table_wait_min: avg(this.tableWaitSamples),
      max_table_wait_min: maxVal(this.tableWaitSamples),
      avg_cashier_service_time_min: avg(this.cashierServiceTimes),
      max_cashier_service_time_min: maxVal(this.cashierServiceTimes),
      avg_kiosk_order_time_min: avg(this.kioskOrderTimes),
      max_kiosk_order_time_min: maxVal(this.kioskOrderTimes),
      avg_dining_time_min: avg(this.diningTimes),
      max_dining_time_min: maxVal(this.diningTimes),
      avg_system_time_min: avg(this.systemTimes),
      avg_table_occupancy: avgOccupancy,
      max_table_occupancy: this.maxOccupancyEver,
      table_utilization_pct: (avgOccupancy / this.config.total_tables) * 100,
      all_time_max_queue_len: this._allTimeMax.cashierQueueLen,
      all_time_max_table_occupancy: this._allTimeMax.tableOccupancy,
      all_time_max_table_util_pct: this._allTimeMax.tableUtilPct
    };
  };

  // ============================================================
  // WebSocket Manager
  // ============================================================
  function WebSocketManager(url, handlers) {
    this.url = url;
    this.handlers = handlers || {};
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 2000;
    this.intentionalClose = false;
    this.status = 'disconnected';
  }

  WebSocketManager.prototype.connect = function () {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.intentionalClose = false;
    this._setStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this._setStatus('disconnected');
      if (this.handlers.onError) this.handlers.onError('Connection failed: ' + e.message);
      this._scheduleReconnect();
      return;
    }
    var self = this;
    this.ws.onopen = function () {
      self._setStatus('connected');
      self.reconnectDelay = 2000;
      if (self.handlers.onOpen) self.handlers.onOpen();
    };
    this.ws.onclose = function () {
      if (!self.intentionalClose) {
        self._setStatus('disconnected');
        if (self.handlers.onDisconnect) self.handlers.onDisconnect();
        self._scheduleReconnect();
      } else {
        self._setStatus('disconnected');
      }
    };
    this.ws.onerror = function () {
      if (self.handlers.onError) self.handlers.onError('WebSocket error');
    };
    this.ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (self.handlers.onMessage) self.handlers.onMessage(msg);
      } catch (e) {
        // ignore malformed messages
      }
    };
  };

  WebSocketManager.prototype.send = function (action, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    var msg = params !== undefined ? { action: action, params: params } : { action: action };
    this.ws.send(JSON.stringify(msg));
    return true;
  };

  WebSocketManager.prototype.disconnect = function () {
    this.intentionalClose = true;
    this._clearReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setStatus('disconnected');
  };

  WebSocketManager.prototype._setStatus = function (status) {
    this.status = status;
    if (this.handlers.onStatusChange) this.handlers.onStatusChange(status);
  };

  WebSocketManager.prototype._scheduleReconnect = function () {
    var self = this;
    this._clearReconnect();
    this.reconnectTimer = setTimeout(function () {
      self._setStatus('connecting');
      self.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
  };

  WebSocketManager.prototype._clearReconnect = function () {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  // ============================================================
  // Dashboard Controller
  // ============================================================
  function Dashboard() {
    this.tween = new TweenEngine();
    this.sim = null;
    this.ws = null;
    this.useBackend = false;
    this.simRunning = false;
    this.simInterval = null;
    this.frozen = false;
    this.rafRunning = false;

    // All-time high tracking for display
    this.allTimeMax = {
      served: 0, lost: 0, throughput: 0,
      avgQueue: 0, maxQueue: 0
    };

    // Rolling window data (last 5 ticks)
    this.rollingLabels = [];
    this.rollingUtil = [];
    this.rollingOccupancy = [];

    // Chart instances
    this.charts = {};
    this._backendHistValid = false;
    this._dirtyCharts = false;
    this._use24hr = false;
    this._startHour = 9;
    this._startMinute = 0;

    // DOM refs
    this.$ = {};
  }

  Dashboard.prototype.init = function () {
    this._cacheDom();
    this._initCharts();
    this._bindEvents();
    this._startTween();

    // Create client-side sim as fallback
    this.sim = new MangInasalSim({
      cashier_count: 3,
      kiosk_count: 0,
      regular_rate_per_minute: 0.29,
      cook_count: 10,
      total_tables: 39,
      dine_in_prob: 0.8
    });

    // Attempt WebSocket connection
    this._connectWebSocket();

    // Show initial state
    this.updateDisplay(this.sim.getMetrics());
  };

  Dashboard.prototype._cacheDom = function () {
    var $ = this.$;
    $.startBtn = document.getElementById('startBtn');
    $.resetBtn = document.getElementById('resetBtn');
    $.speedSlider = document.getElementById('speedSlider');
    $.speedValue = document.getElementById('speedValue');
    $.cashierInput = document.getElementById('cashierInput');
    $.cashierErr = document.getElementById('cashierErr');
    $.kioskInput = document.getElementById('kioskInput');
    $.arrivalInput = document.getElementById('arrivalInput');
    $.arrivalErr = document.getElementById('arrivalErr');
    $.settingsIcon = document.getElementById('settingsIcon');
    $.modalOverlay = document.getElementById('modalOverlay');
    $.closeModal = document.getElementById('closeModal');
    $.kitchenStaff = document.getElementById('kitchenStaff');
    $.kioskRatio = document.getElementById('kioskRatio');
    $.dineInRatio = document.getElementById('dineInRatio');
    $.totalTables = document.getElementById('totalTables');
    $.smoothingToggle = document.getElementById('smoothingToggle');
    $.kioskDisableToggle = document.getElementById('kioskDisableToggle');
    $.formatToggle = document.getElementById('formatToggle');
    $.startTime = document.getElementById('startTime');
    $.saveSettings = document.getElementById('saveSettings');
    $.modalSpeedSlider = document.getElementById('modalSpeedSlider');
    $.modalSpeedValue = document.getElementById('modalSpeedValue');
    $.connStatus = document.getElementById('connStatus');

    $.kpServed = document.getElementById('kpServed');
    $.kpLost = document.getElementById('kpLost');
    $.kpTime = document.getElementById('kpTime');
    $.kpHours = document.getElementById('kpHours');
    $.kpThroughput = document.getElementById('kpThroughput');
    $.kpAvgQueue = document.getElementById('kpAvgQueue');
    $.kpMaxQueue = document.getElementById('kpMaxQueue');

    $.lineChart = document.getElementById('lineChart');
    $.donutChart = document.getElementById('donutChart');
    $.histogramChart = document.getElementById('histogramChart');
    $.barChart = document.getElementById('barChart');
  };

  Dashboard.prototype._initCharts = function () {
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';

    var self = this;

    this.charts.line = new Chart(this.$.lineChart.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Table Utilization %', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', yAxisID: 'y', tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
          { label: 'Current Occupancy', data: [], borderColor: '#f59e0b', yAxisID: 'y1', tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
          { label: 'Max Occupancy', data: [], borderColor: '#ef4444', yAxisID: 'y1', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Utilization %' }, min: 0, max: 100, grid: { color: '#334155' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Occupancy count' }, min: 0, grid: { drawOnChartArea: false } },
          x: { title: { display: true, text: 'Simulation minute' }, grid: { display: false } }
        }
      }
    });

    this.charts.donut = new Chart(this.$.donutChart.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Manual Orders', 'Kiosk Online', 'Kiosk Cash', 'Timeouts'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#64748b', '#22c55e', '#3b82f6', '#ef4444'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { animateRotate: true, duration: 300 },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }
      }
    });

    this.charts.hist = new Chart(this.$.histogramChart.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['0-1','1-2','2-3','3-4','4-5','5-6','6-8','8-10','10-15','15-20','20+'],
        datasets: [
          { label: 'Cashier Wait', data: [], backgroundColor: '#3b82f6' },
          { label: 'Kitchen Wait', data: [], backgroundColor: '#f59e0b' },
          { label: 'Table Wait', data: [], backgroundColor: '#22c55e' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: { y: { title: { display: true, text: 'Frequency' }, beginAtZero: true } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }
      }
    });

    this.charts.bar = new Chart(this.$.barChart.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Cashier Service', 'Kiosk Order', 'Dining', 'System'],
        datasets: [
          { label: 'Avg (min)', data: [], backgroundColor: '#475569' },
          { label: 'Max (min)', data: [], backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: { y: { title: { display: true, text: 'Minutes' }, beginAtZero: true } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }
      }
    });
  };

  Dashboard.prototype._bindEvents = function () {
    var self = this;

    this.$.startBtn.addEventListener('click', function () {
      if (self.simRunning) self.pauseSimulation();
      else self.startSimulation();
    });

    this.$.resetBtn.addEventListener('click', function () {
      self.resetSimulation();
    });

    this.$.speedSlider.addEventListener('input', function () {
      var val = parseFloat(self.$.speedSlider.value);
      self.$.speedValue.textContent = val + 'x';
      self.$.modalSpeedSlider.value = val;
      self.$.modalSpeedValue.textContent = val + 'x';
      if (self.ws && self.ws.status === 'connected') {
        self.ws.send('update_config', { speed: val });
      }
      if (self.simRunning) {
        self.pauseSimulation();
        self.startSimulation();
      }
    });

    this.$.modalSpeedSlider.addEventListener('input', function () {
      var val = parseFloat(self.$.modalSpeedSlider.value);
      self.$.modalSpeedValue.textContent = val + 'x';
      self.$.speedSlider.value = val;
      self.$.speedValue.textContent = val + 'x';
      if (self.ws && self.ws.status === 'connected') {
        self.ws.send('update_config', { speed: val });
      }
      if (self.simRunning) {
        self.pauseSimulation();
        self.startSimulation();
      }
    });

    this.$.cashierInput.addEventListener('change', function () {
      if (self._validateCashierInput()) {
        self.applyQuickParams();
      }
    });

    this.$.arrivalInput.addEventListener('change', function () {
      if (self._validateArrivalInput()) {
        self.applyQuickParams();
      }
    });

    this.$.kioskInput.addEventListener('change', function () {
      self.applyQuickParams();
    });

    this.$.settingsIcon.addEventListener('click', function () {
      self.$.startTime.value = (self._startHour < 10 ? '0' : '') + self._startHour + ':' + (self._startMinute < 10 ? '0' : '') + self._startMinute;
      self.$.modalOverlay.style.display = 'flex';
    });

    this.$.closeModal.addEventListener('click', function () {
      self.$.modalOverlay.style.display = 'none';
    });

    this.$.modalOverlay.addEventListener('click', function (e) {
      if (e.target === self.$.modalOverlay) self.$.modalOverlay.style.display = 'none';
    });

    this.$.kitchenStaff.addEventListener('change', function () {
      self.applyAdvancedParams();
    });
    this.$.kioskRatio.addEventListener('change', function () {
      self.applyAdvancedParams();
    });
    this.$.dineInRatio.addEventListener('change', function () {
      self.applyAdvancedParams();
    });
    this.$.totalTables.addEventListener('change', function () {
      self.applyAdvancedParams();
    });

    this.$.smoothingToggle.addEventListener('change', function () {
      self.tween.enabled = self.$.smoothingToggle.checked;
      if (self.ws && self.ws.status === 'connected') {
        self.ws.send('update_config', {
          max_throughput: !self.$.smoothingToggle.checked,
          animation_smoothing: self.$.smoothingToggle.checked
        });
      }
      if (!self.$.smoothingToggle.checked && self.simRunning) {
        self._runMaxThroughput();
      }
    });

    this.$.kioskDisableToggle.addEventListener('change', function () {
      var enabled = self.$.kioskDisableToggle.checked;
      if (enabled) {
        self.sim._kioskOrderProb = parseFloat(self.$.kioskRatio.value) || 0.87;
      } else {
        self.sim._kioskOrderProb = 0;
      }
      if (self.ws && self.ws.status === 'connected') {
        self.ws.send('update_config', {
          kiosk_disabled: !enabled,
          active_kiosks: enabled ? (parseInt(self.$.kioskInput.value, 10) || 3) : 0
        });
      }
    });

    this.$.formatToggle.addEventListener('change', function () {
      self._use24hr = self.$.formatToggle.checked;
    });

    this.$.startTime.addEventListener('change', function () {
      self._applyStartTime();
    });

    this.$.saveSettings.addEventListener('click', function () {
      self._applyStartTime();
      self.$.modalOverlay.style.display = 'none';
    });

    // Live validation on input
    this.$.cashierInput.addEventListener('input', function () {
      self._validateCashierInput();
    });
    this.$.arrivalInput.addEventListener('input', function () {
      self._validateArrivalInput();
    });
  };

  // ============================================================
  // Validation
  // ============================================================
  Dashboard.prototype._validateCashierInput = function () {
    var val = parseInt(this.$.cashierInput.value, 10);
    var rule = VALIDATION.active_cashiers;
    if (isNaN(val) || val < rule.min || val > rule.max) {
      this.$.cashierInput.classList.add('input-error');
      this.$.cashierErr.textContent = 'Enter ' + rule.min + '-' + rule.max;
      this.$.cashierErr.style.display = 'inline';
      return false;
    }
    this.$.cashierInput.classList.remove('input-error');
    this.$.cashierErr.style.display = 'none';
    return true;
  };

  Dashboard.prototype._validateArrivalInput = function () {
    var val = parseFloat(this.$.arrivalInput.value);
    var rule = VALIDATION.customer_arrival_rate;
    if (isNaN(val) || val < rule.min || val > rule.max) {
      this.$.arrivalInput.classList.add('input-error');
      this.$.arrivalErr.textContent = 'Enter ' + rule.min + '-' + rule.max;
      this.$.arrivalErr.style.display = 'inline';
      return false;
    }
    this.$.arrivalInput.classList.remove('input-error');
    this.$.arrivalErr.style.display = 'none';
    return true;
  };

  // ============================================================
  // WebSocket
  // ============================================================
  Dashboard.prototype._connectWebSocket = function () {
    var self = this;
    this.ws = new WebSocketManager(WS_URL, {
      onOpen: function () {
        self.useBackend = true;
        self.$.connStatus.className = 'connection-status connected';
        self.$.connStatus.textContent = 'CONNECTED';
      },
      onDisconnect: function () {
        self.frozen = true;
        self.$.connStatus.className = 'connection-status disconnected';
        self.$.connStatus.textContent = 'DISCONNECTED';
      },
      onError: function (msg) {
        // Fall back to client-side sim silently
        if (!self.simRunning && !self.frozen) {
          self.useBackend = false;
          self.$.connStatus.className = 'connection-status disconnected';
          self.$.connStatus.textContent = 'OFFLINE';
        }
      },
      onMessage: function (msg) {
        if (msg.type === 'metrics' && msg.data) {
          if (!self.simRunning) return;
          self.frozen = false;
          self._onBackendMetrics(msg.data);
        }
        if (msg.type === 'state') {
          if (msg.status === 'running' && !self.simRunning) {
            self.simRunning = true;
            self.$.startBtn.textContent = '\u23F8 Pause';
            self.$.startBtn.classList.add('active');
          } else if (msg.status === 'paused' && self.simRunning) {
            self.simRunning = false;
            self.$.startBtn.textContent = '\u25B6 Start';
            self.$.startBtn.classList.remove('active');
          }
        }
      },
      onStatusChange: function (status) {
        if (status === 'connecting') {
          self.$.connStatus.className = 'connection-status connecting';
          self.$.connStatus.textContent = 'CONNECTING...';
        }
      }
    });
    this.ws.connect();
  };

  Dashboard.prototype._onBackendMetrics = function (data) {
    if (data.time_labels) {
      this.rollingLabels = data.time_labels.slice(-ROLLING_WINDOW_MINUTES);
    }
    if (data.utilization_series) {
      this.rollingUtil = data.utilization_series.slice(-ROLLING_WINDOW_MINUTES);
    }
    if (data.occupancy_series) {
      this.rollingOccupancy = data.occupancy_series.slice(-ROLLING_WINDOW_MINUTES);
    }

    if (data.hist_cashier_wait) {
      this._backendHistCashier = data.hist_cashier_wait;
      this._backendHistKitchen = data.hist_kitchen_wait || data.hist_cashier_wait;
      this._backendHistTable = data.hist_table_wait || data.hist_cashier_wait;
      this._backendHistValid = true;
    }

    this._updateTweenTargets(data);
  };

  // ============================================================
  // Simulation Control
  // ============================================================
  Dashboard.prototype.startSimulation = function () {
    if (this.simRunning) return;
    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      this.ws.send('play');
      this.simRunning = true;
      this.$.startBtn.textContent = '\u23F8 Pause';
      this.$.startBtn.classList.add('active');
      return;
    }
    // Client-side fallback
    this.simRunning = true;
    this.$.startBtn.textContent = '\u23F8 Pause';
    this.$.startBtn.classList.add('active');
    this.frozen = false;
    this._runClientTick();
  };

  Dashboard.prototype.pauseSimulation = function () {
    if (!this.simRunning) return;
    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      this.ws.send('pause');
      this.simRunning = false;
      this.$.startBtn.textContent = '\u25B6 Start';
      this.$.startBtn.classList.remove('active');
      this._stopClientTick();
      return;
    }
    this.simRunning = false;
    this.$.startBtn.textContent = '\u25B6 Start';
    this.$.startBtn.classList.remove('active');
    this._stopClientTick();
  };

  Dashboard.prototype.stopSimulation = function () {
    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      this.ws.send('stop');
    }
    this.pauseSimulation();
  };

  Dashboard.prototype.resetSimulation = function () {
    this.pauseSimulation();
    this.frozen = false;

    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      this.ws.send('reset');
      // Also reset local state
      this._resetLocalState();
      return;
    }

    this.applyQuickParams();
    this.applyAdvancedParams();
    this.sim.resetState();
    this._resetCharts();
    this._resetAllTimeMax();
    this.updateDisplay(this.sim.getMetrics());
  };

  Dashboard.prototype._resetLocalState = function () {
    this._resetCharts();
    this._resetAllTimeMax();
    this.rollingLabels = [];
    this.rollingUtil = [];
    this.rollingOccupancy = [];
    if (this.sim) this.sim.resetState();
    this.updateDisplay({
      total_customers_served: 0,
      total_customers_lost: 0,
      total_hours_simulated: 0,
      current_minute: 0,
      hourly_throughput: 0,
      avg_cashier_queue_len: 0,
      max_cashier_queue_len: 0,
      kiosk_orders_created: 0,
      kiosk_online_confirmations: 0,
      kiosk_cash_payments: 0,
      manual_orders_count: 0,
      confirmation_timeouts: 0,
      avg_cashier_wait_min: 0, max_cashier_wait_min: 0,
      avg_kitchen_wait_min: 0, max_kitchen_wait_min: 0,
      avg_table_wait_min: 0, max_table_wait_min: 0,
      avg_cashier_service_time_min: 0, max_cashier_service_time_min: 0,
      avg_kiosk_order_time_min: 0, max_kiosk_order_time_min: 0,
      avg_dining_time_min: 0, max_dining_time_min: 0,
      avg_system_time_min: 0,
      avg_table_occupancy: 0, max_table_occupancy: 0,
      table_utilization_pct: 0,
      all_time_max_queue_len: 0,
      all_time_max_table_occupancy: 0,
      all_time_max_table_util_pct: 0
    });
  };

  Dashboard.prototype._resetCharts = function () {
    this._backendHistValid = false;
    this.charts.line.data.labels = [];
    this.charts.line.data.datasets.forEach(function (ds) { ds.data = []; });
    this.charts.line.update('none');
    this.charts.donut.data.datasets[0].data = [0, 0, 0, 0];
    this.charts.donut.update('none');
    this.charts.hist.data.datasets.forEach(function (ds) { ds.data = []; });
    this.charts.hist.update('none');
    this.charts.bar.data.datasets.forEach(function (ds) { ds.data = []; });
    this.charts.bar.update('none');
  };

  Dashboard.prototype._resetAllTimeMax = function () {
    this.allTimeMax = { served: 0, lost: 0, throughput: 0, avgQueue: 0, maxQueue: 0 };
  };

  // ============================================================
  // Client-Side Tick Loop
  // ============================================================
  Dashboard.prototype._runClientTick = function () {
    var self = this;
    self._tickGen = (self._tickGen || 0) + 1;
    var gen = self._tickGen;
    var tick = function () {
      if (!self.simRunning || gen !== self._tickGen) return;
      if (self.frozen) {
        self.simInterval = setTimeout(tick, 50);
        return;
      }
      self.sim.tick();
      var metrics = self.sim.getMetrics();
      self._updateRollingWindow(metrics);
      self._updateTweenTargets(metrics);
      var delay = self.tween.enabled ? (1000 / parseFloat(self.$.speedSlider.value)) : 0;
      self.simInterval = setTimeout(tick, delay);
    };
    tick();
  };

  Dashboard.prototype._runMaxThroughput = function () {
    var self = this;
    if (!self.simRunning) return;
    self._tickGen = (self._tickGen || 0) + 1;
    var gen = self._tickGen;
    self._stopClientTick();
    var tick = function () {
      if (!self.simRunning || gen !== self._tickGen) return;
      if (self.tween.enabled) {
        self._runClientTick();
        return;
      }
      self.sim.tick();
      var metrics = self.sim.getMetrics();
      self._updateRollingWindow(metrics);
      self._updateTweenTargets(metrics);
      self.simInterval = setTimeout(tick, 0);
    };
    tick();
  };

  Dashboard.prototype._stopClientTick = function () {
    if (this.simInterval) {
      clearTimeout(this.simInterval);
      this.simInterval = null;
    }
  };

  // ============================================================
  // Rolling Window (last 5 minutes)
  // ============================================================
  Dashboard.prototype._updateRollingWindow = function (metrics) {
    this.rollingLabels.push(metrics.current_minute);
    this.rollingUtil.push(metrics.table_utilization_pct);
    this.rollingOccupancy.push(metrics.avg_table_occupancy);
    while (this.rollingLabels.length > ROLLING_WINDOW_MINUTES) {
      this.rollingLabels.shift();
      this.rollingUtil.shift();
      this.rollingOccupancy.shift();
    }
  };

  // ============================================================
  // Tween Targets
  // ============================================================
  Dashboard.prototype._updateTweenTargets = function (metrics) {
    // Track all-time highs
    if (metrics.total_customers_served > this.allTimeMax.served) this.allTimeMax.served = metrics.total_customers_served;
    if (metrics.total_customers_lost > this.allTimeMax.lost) this.allTimeMax.lost = metrics.total_customers_lost;
    if (metrics.hourly_throughput > this.allTimeMax.throughput) this.allTimeMax.throughput = metrics.hourly_throughput;

    this.tween.bulkSet({
      served: metrics.total_customers_served,
      lost: metrics.total_customers_lost,
      hours: metrics.total_hours_simulated,
      throughput: metrics.hourly_throughput,
      avgQueue: metrics.avg_cashier_queue_len,
      maxQueue: metrics.max_cashier_queue_len,
      manualOrders: metrics.manual_orders_count,
      kioskOnline: metrics.kiosk_online_confirmations,
      kioskCash: metrics.kiosk_cash_payments,
      timeouts: metrics.confirmation_timeouts,
      avgCashierWait: metrics.avg_cashier_wait_min,
      maxCashierWait: metrics.max_cashier_wait_min,
      avgKitchenWait: metrics.avg_kitchen_wait_min,
      maxKitchenWait: metrics.max_kitchen_wait_min,
      avgTableWait: metrics.avg_table_wait_min,
      maxTableWait: metrics.max_table_wait_min,
      avgCashierService: metrics.avg_cashier_service_time_min,
      maxCashierService: metrics.max_cashier_service_time_min,
      avgKioskOrder: metrics.avg_kiosk_order_time_min,
      maxKioskOrder: metrics.max_kiosk_order_time_min,
      avgDining: metrics.avg_dining_time_min,
      maxDining: metrics.max_dining_time_min,
      avgSystem: metrics.avg_system_time_min,
      avgOccupancy: metrics.avg_table_occupancy,
      maxOccupancy: metrics.max_table_occupancy,
      utilPct: metrics.table_utilization_pct,
      currentMinute: metrics.current_minute
    });
    this._dirtyCharts = true;
  };

  // ============================================================
  // Tween Loop (Render)
  // ============================================================
  Dashboard.prototype._startTween = function () {
    var self = this;
    this.tween.onFrame(function () {
      self._renderFromTween();
    });
    this.tween.start();
  };

  Dashboard.prototype._renderFromTween = function () {
    var t = this.tween;
    var minute = Math.round(t.get('currentMinute'));

    // KPI cards
    this.$.kpServed.textContent = Math.round(t.get('served'));
    this.$.kpLost.textContent = Math.round(t.get('lost'));
    this.$.kpTime.textContent = formatTime(minute, this._use24hr, this._startHour, this._startMinute);
    this.$.kpHours.textContent = t.get('hours').toFixed(2);
    this.$.kpThroughput.textContent = t.get('throughput').toFixed(2);
    this.$.kpAvgQueue.textContent = t.get('avgQueue').toFixed(2);
    this.$.kpMaxQueue.textContent = Math.round(t.get('maxQueue'));

    // All-time high badges
    this.$.kpServed.classList.toggle('alltime-high', Math.round(t.get('served')) >= this.allTimeMax.served && this.allTimeMax.served > 0);
    this.$.kpLost.classList.toggle('alltime-high', Math.round(t.get('lost')) >= this.allTimeMax.lost && this.allTimeMax.lost > 0);

    // Skip chart updates when smoothing is off and no new data arrived
    if (!this.tween.enabled && !this._dirtyCharts) return;

    // Only call chart.update() when data actually changed to prevent
    // tooltip stutter from 60fps canvas redraws (tweening stays intact)
    var i;

    // Donut chart
    var d0 = [
      Math.round(t.get('manualOrders')),
      Math.round(t.get('kioskOnline')),
      Math.round(t.get('kioskCash')),
      Math.round(t.get('timeouts'))
    ];
    var oldDonut = this.charts.donut.data.datasets[0].data;
    for (i = 0; i < 4; i++) {
      if (d0[i] !== oldDonut[i]) {
        this.charts.donut.data.datasets[0].data = d0;
        this.charts.donut.update('none');
        break;
      }
    }

    // Line chart (rolling window)
    var labels = this.rollingLabels.length > 0 ? this.rollingLabels : [minute];
    var utilData = this.rollingUtil.length > 0 ? this.rollingUtil : [t.get('utilPct')];
    var occData = this.rollingOccupancy.length > 0 ? this.rollingOccupancy : [t.get('avgOccupancy')];
    var maxOccData = this.rollingOccupancy.map(function () { return t.get('maxOccupancy'); });
    while (maxOccData.length < labels.length) maxOccData.push(t.get('maxOccupancy'));

    this.charts.line.data.labels = labels.slice();
    this.charts.line.data.datasets[0].data = utilData.slice();
    this.charts.line.data.datasets[1].data = occData.slice();
    this.charts.line.data.datasets[2].data = maxOccData;
    this.charts.line.update('none');

    // Histogram (backend data takes priority, fallback to client sim)
    if (this._backendHistValid) {
      var histChanged = false;
      for (i = 0; i < 11; i++) {
        if (this._backendHistCashier[i] !== this.charts.hist.data.datasets[0].data[i] ||
            this._backendHistKitchen[i] !== this.charts.hist.data.datasets[1].data[i] ||
            this._backendHistTable[i] !== this.charts.hist.data.datasets[2].data[i]) {
          histChanged = true;
          break;
        }
      }
      if (histChanged) {
        this.charts.hist.data.datasets[0].data = this._backendHistCashier;
        this.charts.hist.data.datasets[1].data = this._backendHistKitchen;
        this.charts.hist.data.datasets[2].data = this._backendHistTable;
        this.charts.hist.update('none');
      }
    } else if (this.sim) {
      var cashierBins = computeHistogram(this.sim.cashierWaitSamples);
      var kitchenBins = computeHistogram(this.sim.kitchenWaitSamples);
      var tableBins = computeHistogram(this.sim.tableWaitSamples);
      histChanged = false;
      for (i = 0; i < 11; i++) {
        if (cashierBins[i] !== this.charts.hist.data.datasets[0].data[i] ||
            kitchenBins[i] !== this.charts.hist.data.datasets[1].data[i] ||
            tableBins[i] !== this.charts.hist.data.datasets[2].data[i]) {
          histChanged = true;
          break;
        }
      }
      if (histChanged) {
        this.charts.hist.data.datasets[0].data = cashierBins;
        this.charts.hist.data.datasets[1].data = kitchenBins;
        this.charts.hist.data.datasets[2].data = tableBins;
        this.charts.hist.update('none');
      }
    }

    // Bar chart (Avg vs Max)
    var b0 = [t.get('avgCashierService'), t.get('avgKioskOrder'), t.get('avgDining'), t.get('avgSystem')];
    var b1 = [t.get('maxCashierService'), t.get('maxKioskOrder'), t.get('maxDining'), Math.max(t.get('maxCashierService'), t.get('maxKitchenWait'))];
    var oldB0 = this.charts.bar.data.datasets[0].data;
    var oldB1 = this.charts.bar.data.datasets[1].data;
    for (i = 0; i < 4; i++) {
      if (b0[i] !== oldB0[i] || b1[i] !== oldB1[i]) {
        this.charts.bar.data.datasets[0].data = b0;
        this.charts.bar.data.datasets[1].data = b1;
        this.charts.bar.update('none');
        break;
      }
    }

    this._dirtyCharts = false;
  };

  // ============================================================
  // Display (Direct, for initial/reset state)
  // ============================================================
  Dashboard.prototype.updateDisplay = function (metrics) {
    this._updateTweenTargets(metrics);
    if (this.rollingLabels.length === 0 && metrics.current_minute > 0) {
      this._updateRollingWindow(metrics);
    }
  };

  // ============================================================
  // Parameter Apply
  // ============================================================
  Dashboard.prototype.applyQuickParams = function () {
    if (!this._validateCashierInput() || !this._validateArrivalInput()) return;

    var cashiers = parseInt(this.$.cashierInput.value, 10) || 3;
    var kiosks = parseInt(this.$.kioskInput.value, 10) || 3;
    var arrivalRate = parseFloat(this.$.arrivalInput.value) || 0.29;

    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      kiosks = this.$.kioskDisableToggle.checked ? kiosks : 0;
      this.ws.send('update_config', {
        active_cashiers: cashiers,
        active_kiosks: kiosks,
        customer_arrival_rate: arrivalRate
      });
      return;
    }

    // Client-side
    this.sim.config.cashier_count = cashiers;
    this.sim.config.kiosk.kiosk_count = this.$.kioskDisableToggle.checked ? kiosks : 0;
    this.sim.config.arrival.regular_rate_per_minute = arrivalRate;
    while (this.sim.cashierBusy.length < cashiers) this.sim.cashierBusy.push(0);
    if (this.sim.cashierBusy.length > cashiers) this.sim.cashierBusy.length = cashiers;
    while (this.sim.kioskBusy.length < kiosks) this.sim.kioskBusy.push(0);
    if (this.sim.kioskBusy.length > kiosks) this.sim.kioskBusy.length = kiosks;
  };

  Dashboard.prototype.applyAdvancedParams = function () {
    if (this.useBackend && this.ws && this.ws.status === 'connected') {
      this.ws.send('update_config', {
        kitchen_staff_capacity: parseInt(this.$.kitchenStaff.value, 10) || 10,
        total_table_capacity: parseInt(this.$.totalTables.value, 10) || 39,
        order_type_distribution: { kiosk: parseFloat(this.$.kioskRatio.value) || 0.87 },
        dining_choice_distribution: { dine_in: parseFloat(this.$.dineInRatio.value) || 0.8 },
        kiosk_disabled: !this.$.kioskDisableToggle.checked
      });
      return;
    }

    this.sim.config.cook_count = parseInt(this.$.kitchenStaff.value, 10) || 10;
    this.sim._kioskOrderProb = this.$.kioskDisableToggle.checked ? (parseFloat(this.$.kioskRatio.value) || 0.87) : 0;
    this.sim._dineInProb = parseFloat(this.$.dineInRatio.value) || 0.8;
    this.sim.config.total_tables = parseInt(this.$.totalTables.value, 10) || 39;
    while (this.sim.kitchenBusy.length < this.sim.config.cook_count) this.sim.kitchenBusy.push(0);
    if (this.sim.kitchenBusy.length > this.sim.config.cook_count) this.sim.kitchenBusy.length = this.sim.config.cook_count;
    if (this.tween.enabled !== undefined) {
      this.tween.enabled = this.$.smoothingToggle.checked;
    }
  };

  Dashboard.prototype._applyStartTime = function () {
    var val = this.$.startTime.value;
    if (!val) return;
    var parts = val.split(':');
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return;
    this._startHour = h;
    this._startMinute = m;
  };

  // ============================================================
  // Initialization
  // ============================================================
  document.addEventListener('DOMContentLoaded', function () {
    var dashboard = new Dashboard();
    dashboard.init();
  });

})();
