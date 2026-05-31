'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-script.cjs');

// Beépített fallback model adatai a loadModels() mock-hoz
const FALLBACK_MODEL = {
  id: '__dewolf2003',
  name: 'Fuzárium (De Wolf 2003)',
  params: { topt: 22.5, sigma: 6, rh_thr: 60, precip_min: 1, risk_thr: 50 },
};

// localStorage mock — üres notox-models → loadModels() visszaadja a fallback modellt
const g = loadScripts(['fusarium.js', 'app.js'], { localStorage: {} });

// ── runModelDay ───────────────────────────────────────────────────────────────

describe('runModelDay — null / hiányzó bemenetek', () => {
  const p = FALLBACK_MODEL.params;

  test('null hőmérséklet → 0', () => {
    assert.equal(g.runModelDay(p, null, 80, 5), 0);
  });
  test('null páratartalom → 0', () => {
    assert.equal(g.runModelDay(p, 22.5, null, 5), 0);
  });
});

describe('runModelDay — páratartalom küszöb', () => {
  const p = FALLBACK_MODEL.params; // rh_thr: 60

  test('RH < küszöb → 0', () => {
    assert.equal(g.runModelDay(p, 22.5, 59, 5), 0);
  });
  test('RH = küszöb → 0', () => {
    assert.equal(g.runModelDay(p, 22.5, 60, 5), 0);
  });
  test('RH > küszöb → > 0', () => {
    assert.ok(g.runModelDay(p, 22.5, 61, 5) > 0);
  });
});

describe('runModelDay — hőmérséklet hatás', () => {
  const p = FALLBACK_MODEL.params; // topt: 22.5

  test('optimum hőmérsékleten a legmagasabb output', () => {
    const atOpt = g.runModelDay(p, 22.5, 90, 10);
    const cold  = g.runModelDay(p, 0,    90, 10);
    const hot   = g.runModelDay(p, 40,   90, 10);
    assert.ok(atOpt > cold);
    assert.ok(atOpt > hot);
  });

  test('eredmény 0 és 1 között (normalizált)', () => {
    const r = g.runModelDay(p, 22.5, 95, 10);
    assert.ok(r >= 0 && r <= 1, `${r} nincs 0–1 között`);
  });
});

describe('runModelDay — csapadék hatás', () => {
  const p = FALLBACK_MODEL.params;

  test('0 mm csapadék → 0 (telítési görbe nullából indul)', () => {
    assert.equal(g.runModelDay(p, 22.5, 90, 0), 0);
  });
  test('pozitív csapadék > 0 output', () => {
    assert.ok(g.runModelDay(p, 22.5, 90, 0.1) > 0);
  });
  test('nagyobb csapadék → nagyobb output (telítési pontig)', () => {
    const r1 = g.runModelDay(p, 22.5, 90, 1);
    const r5 = g.runModelDay(p, 22.5, 90, 5);
    assert.ok(r5 > r1);
  });
});

describe('runModelDay — egyedi modell paraméterek', () => {
  test('magasabb topt-ú modell máshol peakel', () => {
    const mHigh = { topt: 30, sigma: 5, rh_thr: 60, precip_min: 1 };
    const mLow  = { topt: 15, sigma: 5, rh_thr: 60, precip_min: 1 };
    // 30°C-on mHigh-nak kell magasabbnak lennie
    assert.ok(g.runModelDay(mHigh, 30, 90, 5) > g.runModelDay(mLow, 30, 90, 5));
    // 15°C-on mLow-nak kell magasabbnak lennie
    assert.ok(g.runModelDay(mLow, 15, 90, 5) > g.runModelDay(mHigh, 15, 90, 5));
  });
});

// ── simulateModel ─────────────────────────────────────────────────────────────

describe('simulateModel — struktúra', () => {
  const series = [
    { date: '2024-06-01', tmean: 22.5, rh_mean: 85, precip: 5,  is_forecast: false },
    { date: '2024-06-02', tmean: 22.5, rh_mean: 90, precip: 10, is_forecast: false },
    { date: '2024-06-03', tmean: 5,    rh_mean: 50, precip: 0,  is_forecast: true  },
  ];

  test('daily tömb hossza == bemeneti sorozat', () => {
    const { daily } = g.simulateModel(FALLBACK_MODEL, series);
    assert.equal(daily.length, series.length);
  });

  test('minden napi rekordnak van date, risk, is_forecast', () => {
    const { daily } = g.simulateModel(FALLBACK_MODEL, series);
    for (const d of daily) {
      assert.ok('date'        in d, 'hiányzó date');
      assert.ok('risk'        in d, 'hiányzó risk');
      assert.ok('is_forecast' in d, 'hiányzó is_forecast');
    }
  });

  test('risk értékek 0–100 között', () => {
    const { daily } = g.simulateModel(FALLBACK_MODEL, series);
    for (const d of daily) {
      assert.ok(d.risk >= 0 && d.risk <= 100, `risk=${d.risk} nincs 0–100 közt`);
    }
  });

  test('summary tartalmaz maxRisk, avgRisk, criticalDays, peakDay', () => {
    const { summary } = g.simulateModel(FALLBACK_MODEL, series);
    assert.ok('maxRisk'      in summary);
    assert.ok('avgRisk'      in summary);
    assert.ok('criticalDays' in summary);
    assert.ok('peakDay'      in summary);
  });

  test('summary.maxRisk == max(daily.risk)', () => {
    const { daily, summary } = g.simulateModel(FALLBACK_MODEL, series);
    const max = Math.max(...daily.map(d => d.risk));
    assert.equal(summary.maxRisk, max);
  });

  test('hideg/száraz nap kockázata 0', () => {
    const { daily } = g.simulateModel(FALLBACK_MODEL, series);
    assert.equal(daily[2].risk, 0); // 5°C, 50% RH, 0mm
  });

  test('is_forecast flag átkerül a daily rekordba', () => {
    const { daily } = g.simulateModel(FALLBACK_MODEL, series);
    assert.equal(daily[0].is_forecast, false);
    assert.equal(daily[2].is_forecast, true);
  });
});

describe('simulateModel — criticalDays számítása', () => {
  test('nincs kritikus nap ha minden kockázat < 75', () => {
    const low = [
      { date: '2024-06-01', tmean: 5, rh_mean: 50, precip: 0, is_forecast: false },
    ];
    const { summary } = g.simulateModel(FALLBACK_MODEL, low);
    assert.equal(summary.criticalDays, 0);
  });
});

// ── loadModels ────────────────────────────────────────────────────────────────

describe('loadModels — fallback viselkedés', () => {
  test('üres localStorage → visszaadja a fallback modellt', () => {
    const models = g.loadModels();
    assert.equal(models.length, 1);
    assert.equal(models[0].id, '__dewolf2003');
  });

  test('fallback modell tartalmaz params.topt, sigma, rh_thr', () => {
    const [m] = g.loadModels();
    assert.ok('topt'     in m.params);
    assert.ok('sigma'    in m.params);
    assert.ok('rh_thr'   in m.params);
  });
});

describe('loadModels — localStorage-ból tölt', () => {
  const custom = [
    { id: 'test-model', name: 'Test', params: { topt: 25, sigma: 5, rh_thr: 65, precip_min: 2 } },
  ];
  const gCustom = loadScripts(['fusarium.js', 'app.js'], {
    localStorage: { 'notox-models': JSON.stringify(custom) },
  });

  test('localStorage-ból olvassa a modelleket', () => {
    const models = gCustom.loadModels();
    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'test-model');
  });

  test('sérült JSON → fallback modell', () => {
    const gBroken = loadScripts(['fusarium.js', 'app.js'], {
      localStorage: { 'notox-models': 'NEM VALID JSON{{{' },
    });
    const models = gBroken.loadModels();
    assert.equal(models.length, 1);
    assert.equal(models[0].id, '__dewolf2003');
  });
});
