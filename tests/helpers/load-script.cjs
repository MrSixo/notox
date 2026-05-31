'use strict';
const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '../../js');

/**
 * Load one or more JS files into a shared vm context and return it.
 * opts.localStorage — mock items map, e.g. { "notox-models": JSON.stringify([...]) }
 */
function loadScripts(names, opts = {}) {
  const mockStorage = opts.localStorage || {};
  const stubEl = { addEventListener: () => {}, style: {}, textContent: '', innerHTML: '' };
  const ctx = vm.createContext({
    Math, console, Date, JSON,
    localStorage: {
      getItem:     key => mockStorage[key] ?? null,
      setItem:     (key, val) => { mockStorage[key] = val; },
      removeItem:  key => { delete mockStorage[key]; },
    },
    document: {
      getElementById:   () => stubEl,
      querySelector:    () => stubEl,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement:    () => stubEl,
    },
    window: { location: { hostname: 'test' } },
    URL: { createObjectURL: () => '' },
    Chart: function() { return { destroy: () => {} }; },
  });

  for (const name of names) {
    const code = fs.readFileSync(path.join(JS_DIR, name), 'utf8');
    vm.runInContext(code, ctx);
  }
  return ctx;
}

module.exports = { loadScripts };
