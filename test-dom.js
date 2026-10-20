'use strict';
/* Temporary DOM smoke test: runs script.js against a minimal stub DOM.
   Run with:  node test-dom.js                                           */

const fs = require('fs');
const vm = require('vm');

/* ---------- minimal DOM stub ---------- */

const IDS = ['stName','stRoll','stDept','stUni','memorySize','cacheSize','blockSize','technique',
  'associativity','policy','assocRow','policyRow','sequence','formulaHint','configSummary',
  'startBtn','prevBtn','nextBtn','resetBtn','exampleDirect','exampleFully','exampleSet','message',
  'stepContent','statTotal','statHits','statMisses','statHitRatio','statMissRatio','hitBar','missBar',
  'cacheTableWrap','memoryGrid','memoryNote','historyBody'];

function makeEl(id, value) {
  const el = {
    id: id, tagName: 'DIV', value: value === undefined ? '' : value,
    _text: '', disabled: false, style: {}, listeners: {}, options: [],
    _html: '',
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    fire(type) { (this.listeners[type] || []).forEach(fn => fn({ key: '', target: this })); },
    appendChild(node) { this.options.push(node); },
    setAttribute() {}
  };
  // A real DOM textContent always reads back as a string, and clearing
  // innerHTML on a <select> removes its options.
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(v) { el._text = String(v); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.options = []; }
  });
  return el;
}

const nodes = {};
IDS.forEach(id => { nodes[id] = makeEl(id); });
// defaults matching index.html
nodes.memorySize.value = '512'; nodes.cacheSize.value = '128'; nodes.blockSize.value = '16';
nodes.technique.value = 'direct'; nodes.policy.value = 'FIFO'; nodes.associativity.value = '2';
nodes.sequence.value = '0, 8, 0, 8, 4, 12, 4, 0, 8';
nodes.associativity.tagName = 'SELECT'; nodes.technique.tagName = 'SELECT'; nodes.policy.tagName = 'SELECT';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const document = {
  getElementById: (id) => nodes[id] || null,
  createElement: () => ({ value: '', textContent: '' }),
  addEventListener: () => {}
};
const window = { addEventListener: () => {} };
const localStorage = { getItem: () => null, setItem: () => {} };

/* ---------- load script.js into a sandbox ---------- */

const code = fs.readFileSync('script.js', 'utf8');
const sandbox = { module: { exports: {} }, document, window, localStorage, console, Math, JSON, Number,
  Array, Object, String, parseInt, isNaN, escape };
vm.createContext(sandbox);
vm.runInContext(code + '\n;initApp();', sandbox);

const txt = (id) => nodes[id].textContent;
const html = (id) => nodes[id].innerHTML;
const optionValues = (id) => nodes[id].options.map(o => Number(o.value));
const optionLabels = (id) => nodes[id].options.map(o => o.textContent);

/* ---------- 1. initial render ---------- */
check('associativity options populated for 8 lines',
  JSON.stringify(optionValues('associativity')) === JSON.stringify([2, 4, 8]),
  JSON.stringify(optionValues('associativity')));
check('associativity labels mention set counts',
  optionLabels('associativity').join('|').includes('4 sets'), optionLabels('associativity').join('|'));
check('associativity defaults to smallest divisor', nodes.associativity.value === '2', nodes.associativity.value);
check('assoc row hidden for direct mapping', nodes.assocRow.style.display === 'none');
check('policy row hidden for direct mapping', nodes.policyRow.style.display === 'none');
check('config summary shows blocks and lines',
  txt('configSummary').includes('32') && txt('configSummary').includes('8'), txt('configSummary'));
check('formula hint set for direct', txt('formulaHint').includes('Cache line = Block %'));
check('memory grid rendered with 32 cells', (html('memoryGrid').match(/mem-cell/g) || []).length === 32,
  String((html('memoryGrid').match(/mem-cell/g) || []).length));
check('step panel shows guidance placeholder', html('stepContent').includes('Start Simulation'));
check('prev/next disabled before start', nodes.prevBtn.disabled && nodes.nextBtn.disabled);

/* ---------- 2. invalid input: block number out of range ---------- */
nodes.sequence.value = '0, 40';
nodes.startBtn.fire('click');
check('out-of-range block rejected', nodes.message.innerHTML.includes('does not exist'), nodes.message.innerHTML);
check('cache not built on invalid input', !html('cacheTableWrap').includes('<table'));

/* ---------- 3. invalid input: incompatible sizes ---------- */
nodes.sequence.value = '0, 1';
nodes.cacheSize.value = '130'; // 130 % 16 != 0
nodes.startBtn.fire('click');
check('non-multiple cache size rejected', nodes.message.innerHTML.includes('exact multiple'), nodes.message.innerHTML);
nodes.cacheSize.value = '128';

/* ---------- 4. empty sequence ---------- */
nodes.sequence.value = '   ';
nodes.startBtn.fire('click');
check('empty sequence rejected', nodes.message.innerHTML.includes('access sequence is empty'), nodes.message.innerHTML);

/* ---------- 4b. invalid sizes: cache larger than memory, negative / zero ---------- */
nodes.sequence.value = '0';
nodes.cacheSize.value = '1024'; // > memorySize 512
nodes.startBtn.fire('click');
check('cache larger than memory rejected',
  nodes.message.innerHTML.includes('cannot be larger than the main memory size'), nodes.message.innerHTML);
nodes.cacheSize.value = '128';
nodes.blockSize.value = '-8';
nodes.startBtn.fire('click');
check('negative block size rejected',
  nodes.message.innerHTML.includes('must be a positive whole number'), nodes.message.innerHTML);
nodes.blockSize.value = '0';
nodes.startBtn.fire('click');
check('zero block size rejected', nodes.message.innerHTML.includes('must be a positive whole number'),
  nodes.message.innerHTML);
nodes.blockSize.value = 'abc';
nodes.startBtn.fire('click');
check('non-numeric size rejected', nodes.message.innerHTML.includes('must be a positive whole number'),
  nodes.message.innerHTML);
nodes.blockSize.value = '16';

/* ---------- 5. set-associative divisibility ---------- */
nodes.sequence.value = '0, 4';
nodes.cacheSize.value = '96'; // 6 cache lines
nodes.technique.value = 'set';
nodes.technique.fire('change');   // repopulates associativity for 6 lines -> 2,3,6
nodes.associativity.value = '4';  // 6 % 4 !== 0 — invalid combination
nodes.startBtn.fire('click');
check('non-divisible associativity rejected',
  nodes.message.innerHTML.includes('must be divisible by the associativity'), nodes.message.innerHTML);
check('associativity offered only valid divisors of 6',
  JSON.stringify(optionValues('associativity')) === JSON.stringify([2, 3, 6]),
  JSON.stringify(optionValues('associativity')));
nodes.cacheSize.value = '128'; nodes.technique.value = 'direct'; nodes.technique.fire('change');

/* ---------- 6. run direct simulation ---------- */
nodes.sequence.value = '0, 8, 0, 8, 4, 12, 4, 0, 8';
nodes.technique.value = 'direct'; nodes.technique.fire('change');
nodes.startBtn.fire('click');
check('start reports ready', nodes.message.innerHTML.includes('Simulation ready'), nodes.message.innerHTML);
check('9 accesses pending', html('stepContent').includes('9 memory access(es)') ||
  html('stepContent').includes('9 memory access'), html('stepContent').slice(0, 120));
check('cache table has 8 rows', (html('cacheTableWrap').match(/<tr /g) || []).length === 8,
  String((html('cacheTableWrap').match(/<tr /g) || []).length));
check('next enabled, prev disabled at step 0', !nodes.nextBtn.disabled && nodes.prevBtn.disabled);

const trace = [];
for (let i = 0; i < 9; i++) {
  nodes.nextBtn.fire('click');
  trace.push({
    step: /Step (\d+) of (\d+)/.exec(html('stepContent'))[0],
    result: html('stepContent').includes('badge-hit') ? 'HIT' : 'MISS',
    line: /row-(hit|miss)/.exec(html('cacheTableWrap')),
    total: txt('statTotal'), hits: txt('statHits'), misses: txt('statMisses'),
    hitRatio: txt('statHitRatio'), missRatio: txt('statMissRatio'),
    historyRows: (html('historyBody').match(/<tr/g) || []).length
  });
}
check('all 9 direct accesses processed', trace[8].step === 'Step 9 of 9', trace[8].step);
check('thrashing sequence gives 0 hits and 9 misses',
  trace[8].hits === '0' && trace[8].misses === '9' && trace[8].total === '9',
  JSON.stringify(trace[8]));
check('ratios 0.0% / 100.0%', trace[8].hitRatio === '0.0%' && trace[8].missRatio === '100.0%',
  trace[8].hitRatio + ' / ' + trace[8].missRatio);
check('history shows 9 rows', trace[8].historyRows === 9, String(trace[8].historyRows));
check('history rows grow one per step', trace.every((t, i) => t.historyRows === i + 1));

/* ---------- 7. Previous Step restores state ---------- */
const before = { total: txt('statTotal'), hits: txt('statHits'), misses: txt('statMisses') };
nodes.prevBtn.fire('click');
const after = { total: txt('statTotal'), hits: txt('statHits'), misses: txt('statMisses') };
check('prev step restores step 8 of 9', html('stepContent').includes('Step 8 of 9'), html('stepContent').slice(0, 80));
check('stats rolled back with the snapshot', after.total === '8' && Number(before.total) === 9,
  JSON.stringify({ before, after }));
check('next re-advances to step 9', (nodes.nextBtn.fire('click'), html('stepContent').includes('Step 9 of 9')));
check('next disabled at last step, prev enabled', nodes.nextBtn.disabled && !nodes.prevBtn.disabled);

// walk fully back and confirm the initial state
for (let i = 0; i < 9; i++) nodes.prevBtn.fire('click');
check('prev stops at Ready (initial) state', html('stepContent').includes('initially') && nodes.prevBtn.disabled,
  html('stepContent').slice(0, 60));
check('stats zeroed at initial state', txt('statTotal') === '0' && txt('statHits') === '0');
check('history cleared at initial state', html('historyBody').includes('No accesses processed yet'));

/* ---------- 8. set-associative rendering: sets and ways ---------- */
nodes.sequence.value = '0, 4, 8, 12';
nodes.technique.value = 'set'; nodes.technique.fire('change');
nodes.associativity.value = '2'; nodes.associativity.fire('change');
nodes.policy.value = 'FIFO'; nodes.policy.fire('change');
check('assoc row visible for set', nodes.assocRow.style.display === '');
check('policy row visible for set', nodes.policyRow.style.display === '');
check('config summary lists sets', txt('configSummary').includes('4') && txt('configSummary').toLowerCase().includes('set'),
  txt('configSummary'));
nodes.startBtn.fire('click');
nodes.nextBtn.fire('click');
check('cache table shows Set and Way columns',
  html('cacheTableWrap').includes('>Set<') && html('cacheTableWrap').includes('>Way<'));
check('set 0 block 0 loaded into line 0 way 0', html('cacheTableWrap').includes('row-miss'));
const otherSearched = (html('cacheTableWrap').match(/row-searched/g) || []).length;
check('the other way of the set is marked Checked', otherSearched === 1, String(otherSearched));
check('history location mentions Set/Way',
  html('historyBody').includes('Set 0') && html('historyBody').includes('Way'), html('historyBody').slice(0, 200));
for (let i = 0; i < 3; i++) nodes.nextBtn.fire('click');
check('set-assoc 0,4,8,12 -> 4 misses', txt('statMisses') === '4' && txt('statHits') === '0',
  txt('statHits') + '/' + txt('statMisses'));
check('eviction visible on last step', html('cacheTableWrap').includes('replaced B'),
  html('cacheTableWrap').slice(0, 100));

/* ---------- 9. example buttons ---------- */
nodes.exampleFully.fire('click');
check('fully example loads cache 64 -> 4 lines', txt('configSummary').includes('4'), txt('configSummary'));
check('fully example shows LRU policy', nodes.policy.value === 'LRU', nodes.policy.value);
nodes.exampleSet.fire('click');
check('set example loads 2-way with 4 sets',
  nodes.technique.value === 'set' && nodes.associativity.value === '2' &&
  txt('configSummary').includes('Sets: 4'), txt('configSummary'));
nodes.exampleDirect.fire('click');
check('direct example loads direct sequence',
  nodes.technique.value === 'direct' && nodes.sequence.value === '0, 8, 0, 8, 4, 12, 4, 0, 8');
check('example clears the running simulation', html('stepContent').includes('Start Simulation'));

/* ---------- 10. reset ---------- */
nodes.startBtn.fire('click');
nodes.nextBtn.fire('click');
nodes.resetBtn.fire('click');
check('reset clears stats and history', txt('statTotal') === '0' &&
  html('historyBody').includes('No accesses processed yet'));
check('reset disables stepping buttons', nodes.nextBtn.disabled && nodes.prevBtn.disabled);

/* ---------- 11. XSS safety of user-entered text ---------- */
nodes.sequence.value = '<img src=x onerror=alert(1)>';
nodes.startBtn.fire('click');
check('invalid input is escaped, not injected',
  !nodes.message.innerHTML.includes('<img') && nodes.message.innerHTML.includes('&lt;img'),
  nodes.message.innerHTML.slice(0, 160));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
