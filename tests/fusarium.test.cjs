'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-script.cjs');

const g = loadScripts(['fusarium.js']);

// ── fusariumRisk ─────────────────────────────────────────────────────────────

describe('fusariumRisk — null / hiányzó bemenetek', () => {
  test('null hőmérséklet → 0', () => {
    assert.equal(g.fusariumRisk(null, 80, 5), 0);
  });
  test('null páratartalom → 0', () => {
    assert.equal(g.fusariumRisk(22.5, null, 5), 0);
  });
  test('undefined páratartalom → 0', () => {
    assert.equal(g.fusariumRisk(22.5, undefined, 5), 0);
  });
});

describe('fusariumRisk — páratartalom küszöb', () => {
  test('RH 59% (küszöb alatt) → 0', () => {
    assert.equal(g.fusariumRisk(22.5, 59, 5), 0);
  });
  test('RH 60% (pontosan küszöb) → 0', () => {
    assert.equal(g.fusariumRisk(22.5, 60, 5), 0);
  });
  test('RH 61% (küszöb felett) → > 0', () => {
    assert.ok(g.fusariumRisk(22.5, 61, 5) > 0);
  });
  test('RH 100% → magasabb mint RH 70%', () => {
    assert.ok(g.fusariumRisk(22.5, 100, 5) > g.fusariumRisk(22.5, 70, 5));
  });
});

describe('fusariumRisk — hőmérséklet hatás', () => {
  test('optimum hőmérsékleten (22.5°C) a legmagasabb', () => {
    const atOpt  = g.fusariumRisk(22.5, 90, 10);
    const cold   = g.fusariumRisk(5,    90, 10);
    const hot    = g.fusariumRisk(40,   90, 10);
    assert.ok(atOpt > cold, `opt(${atOpt}) > cold(${cold})`);
    assert.ok(atOpt > hot,  `opt(${atOpt}) > hot(${hot})`);
  });
  test('nagyon hidegen (0°C) közel 0', () => {
    assert.ok(g.fusariumRisk(0, 90, 10) < 1);
  });
  test('nagyon melegen (45°C) közel 0', () => {
    assert.ok(g.fusariumRisk(45, 90, 10) < 1);
  });
});

describe('fusariumRisk — csapadék hatás', () => {
  test('0 mm csapadék → csökkentett kockázat', () => {
    const withRain    = g.fusariumRisk(22.5, 90, 5);
    const withoutRain = g.fusariumRisk(22.5, 90, 0);
    assert.ok(withRain > withoutRain, `rain(${withRain}) > noRain(${withoutRain})`);
  });
  test('magas csapadék (>5 mm) kb. telítési szint', () => {
    const r5  = g.fusariumRisk(22.5, 90, 5);
    const r20 = g.fusariumRisk(22.5, 90, 20);
    // 20mm nem lehet kétszer annyi mint 5mm (telítési görbe)
    assert.ok(r20 < r5 * 1.5, `telítési görbe: r20(${r20}) < r5*1.5(${r5 * 1.5})`);
  });
});

describe('fusariumRisk — tartomány', () => {
  test('eredmény 0 és 100 között van', () => {
    const cases = [
      [22.5, 90, 10], [15, 75, 3], [0, 50, 0],
      [35, 100, 20], [22.5, 60, 0.1],
    ];
    for (const [t, rh, p] of cases) {
      const r = g.fusariumRisk(t, rh, p);
      assert.ok(r >= 0 && r <= 100, `fusariumRisk(${t},${rh},${p}) = ${r} nincs 0–100 közt`);
    }
  });
});

// ── riskLevel ────────────────────────────────────────────────────────────────

describe('riskLevel — besorolási határok', () => {
  test('0 → alacsony', ()  => assert.equal(g.riskLevel(0).cls,  'low'));
  test('19 → alacsony', () => assert.equal(g.riskLevel(19).cls, 'low'));
  test('20 → közepes', ()  => assert.equal(g.riskLevel(20).cls, 'medium'));
  test('49 → közepes', ()  => assert.equal(g.riskLevel(49).cls, 'medium'));
  test('50 → magas', ()    => assert.equal(g.riskLevel(50).cls, 'high'));
  test('74 → magas', ()    => assert.equal(g.riskLevel(74).cls, 'high'));
  test('75 → kritikus', () => assert.equal(g.riskLevel(75).cls, 'critical'));
  test('100 → kritikus', ()=> assert.equal(g.riskLevel(100).cls,'critical'));
});

describe('riskLevel — visszatérési struktúra', () => {
  test('tartalmaz label, cls, color mezőket', () => {
    const rl = g.riskLevel(50);
    assert.ok(rl.label,  'nincs label');
    assert.ok(rl.cls,    'nincs cls');
    assert.ok(rl.color,  'nincs color');
  });
  test('color hex formátumban van', () => {
    const rl = g.riskLevel(80);
    assert.match(rl.color, /^#[0-9a-fA-F]{6}$/);
  });
});

// ── simulateFusarium ─────────────────────────────────────────────────────────

describe('simulateFusarium — struktúra és számítások', () => {
  const series = [
    { date: '2024-06-01', tmean: 22.5, rh_mean: 85, precip: 5,   is_forecast: false },
    { date: '2024-06-02', tmean: 22.5, rh_mean: 90, precip: 10,  is_forecast: false },
    { date: '2024-06-03', tmean: 5,    rh_mean: 50, precip: 0,   is_forecast: true  },
    { date: '2024-06-04', tmean: 22.5, rh_mean: 59, precip: 5,   is_forecast: true  },
  ];

  test('daily tömb hossza == bemeneti sorozat hossza', () => {
    const { daily } = g.simulateFusarium(series);
    assert.equal(daily.length, series.length);
  });

  test('minden napi rekordnak van date, risk, cls, label, is_forecast', () => {
    const { daily } = g.simulateFusarium(series);
    for (const d of daily) {
      assert.ok('date'        in d, 'hiányzó date');
      assert.ok('risk'        in d, 'hiányzó risk');
      assert.ok('cls'         in d, 'hiányzó cls');
      assert.ok('label'       in d, 'hiányzó label');
      assert.ok('is_forecast' in d, 'hiányzó is_forecast');
    }
  });

  test('summary.maxRisk === max(daily.risk)', () => {
    const { daily, summary } = g.simulateFusarium(series);
    const max = Math.max(...daily.map(d => d.risk));
    assert.equal(summary.maxRisk, Math.round(max * 10) / 10);
  });

  test('hideg/száraz napon kockázat 0', () => {
    const { daily } = g.simulateFusarium(series);
    // 3. nap: 5°C, 50%RH, 0mm → 0
    assert.equal(daily[2].risk, 0);
  });

  test('RH küszöb alatt napon kockázat 0', () => {
    const { daily } = g.simulateFusarium(series);
    // 4. nap: RH=59% < 60 → 0
    assert.equal(daily[3].risk, 0);
  });

  test('summary.criticalDays helyes', () => {
    const highRiskSeries = [
      { date: '2024-06-01', tmean: 22.5, rh_mean: 100, precip: 20, is_forecast: false },
      { date: '2024-06-02', tmean: 22.5, rh_mean: 100, precip: 20, is_forecast: false },
      { date: '2024-06-03', tmean: 5,    rh_mean: 50,  precip: 0,  is_forecast: false },
    ];
    const { summary } = g.simulateFusarium(highRiskSeries);
    // Az első két nap magas kockázatú, a harmadik nem
    assert.ok(summary.criticalDays <= 2);
    assert.ok(summary.criticalDays >= 0);
  });
});
