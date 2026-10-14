import { describe, expect, it } from 'vitest';
import { Counter, Gauge, Histogram, metrics, renderMetrics } from '../lib/metrics';

describe('Counter', () => {
  it('starts at zero and accumulates deltas', () => {
    const c = new Counter('probe_total', 'probe');
    expect(c.value()).toBe(0);
    c.inc();
    c.inc();
    c.inc(undefined, 5);
    expect(c.value()).toBe(7);
  });

  it('tracks label sets as separate series', () => {
    const c = new Counter('probe2_total', 'probe');
    c.inc({ event: 'offer' });
    c.inc({ event: 'offer' });
    c.inc({ event: 'answer' });
    expect(c.value({ event: 'offer' })).toBe(2);
    expect(c.value({ event: 'answer' })).toBe(1);
    expect(c.value({ event: 'candidate' })).toBe(0);
  });

  it('renders HELP/TYPE metadata and values', () => {
    const c = new Counter('probe3_total', 'a help text');
    c.inc();
    const out = c.render();
    expect(out).toContain('# HELP probe3_total a help text');
    expect(out).toContain('# TYPE probe3_total counter');
    expect(out).toContain('probe3_total 1');
  });

  it('renders a zero line when never incremented', () => {
    const out = new Counter('probe4_total', 'probe').render();
    expect(out).toContain('probe4_total 0');
  });
});

describe('Gauge', () => {
  it('supports set/inc/dec', () => {
    const g = new Gauge('probe_gauge', 'probe');
    g.set(10);
    g.inc(5);
    g.dec(3);
    expect(g.value()).toBe(12);
  });

  it('renders current value', () => {
    const g = new Gauge('probe2_gauge', 'probe');
    g.set(4);
    expect(g.render()).toContain('probe2_gauge 4');
  });
});

describe('Histogram', () => {
  const buckets = [0.1, 1, 10];

  it('accumulates count and sum', () => {
    const h = new Histogram('probe_hist', 'probe', buckets);
    expect(h.count()).toBe(0);
    h.observe(0.05);
    h.observe(2);
    h.observe(30); // above highest bucket -> only +Inf
    expect(h.count()).toBe(3);
    expect(h.sum()).toBeCloseTo(32.05, 5);
  });

  it('renders cumulative buckets, sum and count', () => {
    const h = new Histogram('probe2_hist', 'probe', buckets);
    h.observe(0.05);
    h.observe(2);
    const out = h.render();
    expect(out).toContain('probe2_hist_bucket{le="0.1"} 1');
    expect(out).toContain('probe2_hist_bucket{le="1"} 1');
    expect(out).toContain('probe2_hist_bucket{le="10"} 2');
    expect(out).toContain('probe2_hist_bucket{le="+Inf"} 2');
    expect(out).toContain('probe2_hist_sum 2.05');
    expect(out).toContain('probe2_hist_count 2');
  });

  it('tracks label sets independently', () => {
    const h = new Histogram('probe3_hist', 'probe', buckets);
    h.observe(0.5, { kind: 'a' });
    h.observe(0.5, { kind: 'b' });
    h.observe(0.5, { kind: 'b' });
    expect(h.count({ kind: 'a' })).toBe(1);
    expect(h.count({ kind: 'b' })).toBe(2);
  });
});

describe('cardinality cap', () => {
  it('overflows beyond MAX_SERIES instead of growing forever', () => {
    const c = new Counter('capped_total', 'cardinality probe');
    for (let i = 0; i < 250; i++) c.inc({ id: `series-${i}` });
    const seriesLines = c
      .render()
      .split('\n')
      .filter((l) => l.startsWith('capped_total{') || /^capped_total\s/.test(l));
    // <= 200 kept label sets + at most one overflow series (+ the zero line
    // is not rendered once series exist).
    expect(seriesLines.length).toBeLessThanOrEqual(201);
    expect(c.render()).toContain('__overflow__');
  });
});

describe('label escaping', () => {
  it('escapes quotes, backslashes and newlines in label values', () => {
    const c = new Counter('escaped_total', 'probe');
    c.inc({ v: 'a"b\\c\nd' });
    const out = c.render();
    expect(out).toContain('v="a\\"b\\\\c\\nd"');
  });
});

describe('application metrics registry', () => {
  it('exposes the Phase 4/6 metric names dashboards depend on', () => {
    const expected = [
      'pulse_socket_connections_total',
      'pulse_sockets_active',
      'pulse_matches_started_total',
      'pulse_match_latency_seconds',
      'pulse_queue_depth',
      'pulse_match_skip_total',
      'pulse_match_end_total',
      'pulse_signaling_relayed_total',
      'pulse_signaling_dropped_total',
      'pulse_match_messages_total',
      'pulse_matchmaking_errors_total',
      'pulse_matchmaking_rate_limited_total',
      'pulse_ice_outcome_final',
      'pulse_ice_transport_total',
      'pulse_call_duration_seconds',
      'pulse_call_rtt_ms',
      'pulse_http_requests_total',
      'pulse_http_request_duration_seconds',
      'pulse_build_info',
    ];
    const text = renderMetrics();
    for (const name of expected) {
      expect(text, `missing metric ${name}`).toContain(`# HELP ${name} `);
      expect(text, `missing type for ${name}`).toContain(`# TYPE ${name} `);
    }
  });

  it('renders well-formed Prometheus text ending in a newline', () => {
    metrics.socketConnections.inc();
    const text = renderMetrics();
    expect(text.endsWith('\n')).toBe(true);
    expect(text).not.toContain('undefined');
    expect(text).toContain(`pulse_build_info{node="${process.version}"} 1`);
  });

  it('records HTTP + socket observations end to end', () => {
    metrics.httpRequests.inc({ route: 'GET /health', status: '2xx' });
    metrics.httpDuration.observe(0.02, { route: 'GET /health' });
    metrics.socketsActive.set(7);

    expect(metrics.httpRequests.value({ route: 'GET /health', status: '2xx' })).toBe(1);
    expect(metrics.httpDuration.count({ route: 'GET /health' })).toBe(1);
    expect(metrics.httpDuration.sum({ route: 'GET /health' })).toBeCloseTo(0.02, 5);
    expect(metrics.socketsActive.value()).toBe(7);
  });
});
