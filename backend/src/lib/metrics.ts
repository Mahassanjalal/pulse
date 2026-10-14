/**
 * metrics.ts — minimal, dependency-free metrics registry (Phase 6).
 *
 * Prometheus text exposition at GET /metrics (see routes/index.ts). Kept
 * deliberately small: counters, gauges and fixed-bucket histograms with a
 * hard cardinality cap so a bad label value can never blow up memory.
 *
 * Not a replacement for a full OTel stack — it exists so the SLOs from the
 * scaling plan (match latency p95, signaling delivery, ICE success rate,
 * API p95) are actually MEASURABLE today, on every node, scrapeable by
 * Prometheus/Grafana later without code changes.
 */

type Labels = Record<string, string>;

/** Overflow bucket for label combinations beyond MAX_SERIES per metric. */
const OVERFLOW = '__overflow__';
/** Max distinct label sets per metric (protects memory / TSDB cardinality). */
const MAX_SERIES = 200;

function labelKey(labels?: Labels): string {
  if (!labels) return '';
  const keys = Object.keys(labels).sort();
  if (!keys.length) return '';
  return keys.map((k) => `${k}="${escapeLabel(labels[k] ?? '')}"`).join(',');
}

function escapeLabel(v: string): string {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function seriesId(metric: string, key: string): string {
  return key ? `${metric}|${key}` : metric;
}

/**
 * Track which label keys we've seen per metric so the overflow series keeps
 * a stable shape (Prometheus requires consistent label sets per metric).
 */
const seriesKeys = new Map<string, Set<string>>();
const overflowed = new Set<string>();

function rememberSeries(metric: string, key: string): string {
  let keys = seriesKeys.get(metric);
  if (!keys) {
    keys = new Set();
    seriesKeys.set(metric, keys);
  }
  if (keys.has(key)) return key;
  if (keys.size >= MAX_SERIES && !overflowed.has(metric)) {
    overflowed.add(metric);
    return OVERFLOW;
  }
  if (overflowed.has(metric) && key !== OVERFLOW) return OVERFLOW;
  keys.add(key);
  return key;
}

// ---------------------------------------------------------------------------

export class Counter {
  private values = new Map<string, number>();
  constructor(
    private name: string,
    private help: string,
  ) {}
  inc(labels?: Labels, delta = 1): void {
    const key = rememberSeries(this.name, labelKey(labels));
    this.values.set(key, (this.values.get(key) ?? 0) + delta);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    for (const [key, v] of this.values) {
      lines.push(key ? `${this.name}{${key}} ${v}` : `${this.name} ${v}`);
    }
    return lines.join('\n');
  }
  /** Test/ops helper: value for a label set (0 when never incremented). */
  value(labels?: Labels): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }
}

export class Gauge {
  private values = new Map<string, number>();
  constructor(
    private name: string,
    private help: string,
    private defaultLabels?: Labels,
  ) {}
  set(v: number, labels?: Labels): void {
    const merged = { ...(this.defaultLabels ?? {}), ...(labels ?? {}) };
    const key = rememberSeries(this.name, labelKey(Object.keys(merged).length ? merged : undefined));
    this.values.set(key, v);
  }
  inc(delta = 1, labels?: Labels): void {
    const merged = { ...(this.defaultLabels ?? {}), ...(labels ?? {}) };
    const key = rememberSeries(this.name, labelKey(Object.keys(merged).length ? merged : undefined));
    this.values.set(key, (this.values.get(key) ?? 0) + delta);
  }
  dec(delta = 1, labels?: Labels): void {
    this.inc(-delta, labels);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    for (const [key, v] of this.values) {
      lines.push(key ? `${this.name}{${key}} ${v}` : `${this.name} ${v}`);
    }
    return lines.join('\n');
  }
  value(labels?: Labels): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }
}

interface HistState {
  counts: number[]; // one per bucket
  sum: number;
  count: number;
}

export class Histogram {
  private states = new Map<string, HistState>();
  constructor(
    private name: string,
    private help: string,
    private buckets: number[], // ascending; +Inf is implicit
  ) {}
  observe(v: number, labels?: Labels): void {
    const key = rememberSeries(this.name, labelKey(labels));
    let st = this.states.get(key);
    if (!st) {
      st = { counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.states.set(key, st);
    }
    st.sum += v;
    st.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      // Cumulative (Prometheus `le` semantics): increment EVERY bucket whose
      // upper bound >= v. Bounds are ascending, so a small bound failing the
      // check does NOT mean later (larger) bounds fail — no break here.
      const bound = this.buckets[i];
      if (bound !== undefined && v <= bound) st.counts[i] = (st.counts[i] ?? 0) + 1;
    }
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    if (this.states.size === 0) {
      for (const b of this.buckets) lines.push(`${this.name}_bucket{le="${b}"} 0`);
      lines.push(`${this.name}_bucket{le="+Inf"} 0`, `${this.name}_sum 0`, `${this.name}_count 0`);
      return lines.join('\n');
    }
    for (const [key, st] of this.states) {
      const lbl = key ? `${key},` : '';
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(`${this.name}_bucket{${lbl}le="${this.buckets[i]}"} ${st.counts[i]}`);
      }
      lines.push(`${this.name}_bucket{${lbl}le="+Inf"} ${st.count}`);
      lines.push(`${this.name}_sum${key ? `{${key}}` : ''} ${round(st.sum)}`);
      lines.push(`${this.name}_count${key ? `{${key}}` : ''} ${st.count}`);
    }
    return lines.join('\n');
  }
  /** Count of observations for a label set (test helper). */
  count(labels?: Labels): number {
    return this.states.get(labelKey(labels))?.count ?? 0;
  }
  sum(labels?: Labels): number {
    return this.states.get(labelKey(labels))?.sum ?? 0;
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Application metric definitions
// ---------------------------------------------------------------------------

/** Seconds buckets chosen for SLOs: sub-100ms to 30s. */
const LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];
/** Call duration seconds: 10s .. 1h. */
const DURATION_BUCKETS = [10, 30, 60, 120, 300, 600, 1800, 3600];
/** HTTP request seconds: 5ms .. 10s. */
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const metrics = {
  // --- realtime ---
  socketConnections: new Counter('pulse_socket_connections_total', 'Accepted socket connections'),
  socketsActive: new Gauge('pulse_sockets_active', 'Locally connected sockets right now'),
  matchesStarted: new Counter('pulse_matches_started_total', 'Matches created (status ACTIVE)'),
  /** Time from a user's joinQueue to match_found, per user, seconds. */
  matchLatency: new Histogram(
    'pulse_match_latency_seconds',
    'Time from join_queue to match_found per user (seconds)',
    LATENCY_BUCKETS,
  ),
  queueDepth: new Gauge('pulse_queue_depth', 'Waiting users in the matchmaking queue (at scrape)'),
  skipTotal: new Counter('pulse_match_skip_total', 'skip_match events'),
  endTotal: new Counter('pulse_match_end_total', 'end_match / end_direct_call hang-ups'),
  signalingRelayed: new Counter('pulse_signaling_relayed_total', 'WebRTC signaling packets relayed'),
  signalingDrop: new Counter('pulse_signaling_dropped_total', 'WebRTC signaling packets dropped (peer not found)'),
  matchMessages: new Counter('pulse_match_messages_total', 'In-match chat messages persisted'),
  matchmakingErrors: new Counter('pulse_matchmaking_errors_total', 'start_matching handler failures'),
  matchmakingRateLimited: new Counter('pulse_matchmaking_rate_limited_total', 'start_matching requests rejected by rate limit'),

  // --- call quality (client-reported, Phase 4) ---
  iceOutcome: new Counter('pulse_ice_outcome_final', 'Final ICE connection outcome reported by clients'),
  iceTransport: new Counter('pulse_ice_transport_total', 'Selected ICE transport per completed/failed call'),
  callDuration: new Histogram('pulse_call_duration_seconds', 'Client-reported call duration (seconds)', DURATION_BUCKETS),
  callRtt: new Histogram('pulse_call_rtt_ms', 'Client-reported RTT of the selected candidate pair (ms)', [10, 25, 50, 100, 200, 400, 800, 1500]),

  // --- HTTP ---
  httpRequests: new Counter('pulse_http_requests_total', 'HTTP requests by route pattern and status class'),
  httpDuration: new Histogram('pulse_http_request_duration_seconds', 'HTTP request duration by route pattern (seconds)', HTTP_BUCKETS),

  // --- process ---
  buildInfo: new Gauge('pulse_build_info', 'Build metadata (always 1)'),
};

metrics.buildInfo.set(1, { node: process.version });

/** Render every metric in Prometheus text exposition format. */
export function renderMetrics(): string {
  const parts = [
    metrics.socketConnections.render(),
    metrics.socketsActive.render(),
    metrics.matchesStarted.render(),
    metrics.matchLatency.render(),
    metrics.queueDepth.render(),
    metrics.skipTotal.render(),
    metrics.endTotal.render(),
    metrics.signalingRelayed.render(),
    metrics.signalingDrop.render(),
    metrics.matchMessages.render(),
    metrics.matchmakingErrors.render(),
    metrics.matchmakingRateLimited.render(),
    metrics.iceOutcome.render(),
    metrics.iceTransport.render(),
    metrics.callDuration.render(),
    metrics.callRtt.render(),
    metrics.httpRequests.render(),
    metrics.httpDuration.render(),
    metrics.buildInfo.render(),
  ];
  return parts.join('\n\n') + '\n';
}
