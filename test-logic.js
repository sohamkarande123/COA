'use strict';
/* Temporary Node test suite for the pure simulation core in script.js.
   Run with:  node test-logic.js                                        */

const { buildSimulation } = require('./script.js');

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function results(steps) {
  return steps.slice(1).map(s => s.result);
}

/* ---------- 1. Repeated access to the same block (direct) ---------- */
{
  const steps = buildSimulation({ numLines: 8, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: [5, 5, 5] });
  check('repeated block: M,H,H', JSON.stringify(results(steps)) === JSON.stringify(['MISS', 'HIT', 'HIT']),
    JSON.stringify(results(steps)));
  check('stats: 1 miss + 2 hits = 3', steps[3].hits === 2 && steps[3].misses === 1);
  check('block 5 in line 5 with tag 0', steps[3].lines[5].block === 5 && steps[3].lines[5].tag === 0);
}

/* ---------- 2. Direct conflict: blocks 0 and 8 share line 0 ---------- */
{
  const steps = buildSimulation({ numLines: 8, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: [0, 8, 0] });
  check('conflict: all MISS (0,8,0)', JSON.stringify(results(steps)) === JSON.stringify(['MISS', 'MISS', 'MISS']),
    JSON.stringify(results(steps)));
  check('after 0,8: line 0 holds block 8 tag 1', steps[2].lines[0].block === 8 && steps[2].lines[0].tag === 1);
  const s3 = steps[3];
  check('step 3 evicted block 8', s3.evicted === 8, 'evicted=' + s3.evicted);
  check('direct formulas in calc text', s3.calc.includes('0 % 8 = 0') && s3.calc.includes('floor(0 / 8) = 0'));
}

/* ---------- 3. Direct tag formula for block 13, 8 lines ---------- */
{
  const steps = buildSimulation({ numLines: 8, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: [13] });
  check('block 13 -> line 5', steps[1].lineIndex === 5, 'line=' + steps[1].lineIndex);
  check('block 13 -> tag 1', steps[1].tag === 1, 'tag=' + steps[1].tag);
}

/* ---------- 4. Fully associative FIFO vs LRU differ ---------- */
{
  // 2-line cache, sequence 0,1,0,2,1
  const fifo = buildSimulation({ numLines: 2, technique: 'fully',
    associativity: 1, policy: 'FIFO', sequence: [0, 1, 0, 2, 1] });
  const lru  = buildSimulation({ numLines: 2, technique: 'fully',
    associativity: 1, policy: 'LRU', sequence: [0, 1, 0, 2, 1] });
  check('FIFO results M,M,H,M,H', JSON.stringify(results(fifo)) === JSON.stringify(['MISS', 'MISS', 'HIT', 'MISS', 'HIT']),
    JSON.stringify(results(fifo)));
  check('LRU  results M,M,H,M,M', JSON.stringify(results(lru)) === JSON.stringify(['MISS', 'MISS', 'HIT', 'MISS', 'MISS']),
    JSON.stringify(results(lru)));
  check('FIFO step4 evicted block 0', fifo[4].evicted === 0, 'evicted=' + fifo[4].evicted);
  check('LRU  step4 evicted block 1', lru[4].evicted === 1, 'evicted=' + lru[4].evicted);
}

/* ---------- 5. Fully associative fills empty lines before replacing ---------- */
{
  const steps = buildSimulation({ numLines: 2, technique: 'fully',
    associativity: 1, policy: 'FIFO', sequence: [3, 7] });
  check('fills lines 0 then 1, no eviction', steps[1].lineIndex === 0 && steps[2].lineIndex === 1 &&
    steps[1].evicted === null && steps[2].evicted === null);
  check('fully assoc tag = block number', steps[2].lines[1].tag === 7);
}

/* ---------- 6. Set-associative: set/tag formulas and search only one set ---------- */
{
  // 8 lines, 2-way -> 4 sets
  const steps = buildSimulation({ numLines: 8, technique: 'set',
    associativity: 2, policy: 'FIFO', sequence: [13] });
  check('block 13 -> set 1', steps[1].setIndex === 1, 'set=' + steps[1].setIndex);
  check('block 13 -> tag 3', steps[1].tag === 3, 'tag=' + steps[1].tag);
  check('searched only lines 2 and 3', JSON.stringify(steps[1].searched) === JSON.stringify([2, 3]),
    JSON.stringify(steps[1].searched));
  check('loaded into way 0 of set 1 (line 2)', steps[1].lineIndex === 2 && steps[1].wayIndex === 0);
}

/* ---------- 7. Set-associative: blocks 0,4,8,12 all hit set 0; FIFO evicts ---------- */
{
  const steps = buildSimulation({ numLines: 8, technique: 'set',
    associativity: 2, policy: 'FIFO', sequence: [0, 4, 8, 12] });
  check('0,4,8,12 all MISS', JSON.stringify(results(steps)) === JSON.stringify(['MISS', 'MISS', 'MISS', 'MISS']),
    JSON.stringify(results(steps)));
  check('block 0 in set 0 way 0', steps[1].lineIndex === 0);
  check('block 4 in set 0 way 1', steps[2].lineIndex === 1);
  check('block 8 evicts block 0 (FIFO)', steps[3].evicted === 0 && steps[3].lineIndex === 0,
    'evicted=' + steps[3].evicted);
  check('block 12 evicts block 4 (FIFO)', steps[4].evicted === 4 && steps[4].lineIndex === 1,
    'evicted=' + steps[4].evicted);
  check('set 2 and set 3 untouched', steps[4].lines[4].block === null && steps[4].lines[6].block === null);
}

/* ---------- 8. Set-associative LRU keeps recently used ---------- */
{
  // 4 lines, 2-way -> 2 sets. Sequence 0,2,4,2: set0 has {0}, set1 {2,4}...
  // Simpler: 2 sets. 0->S0, 2->S0? 2%2=0 yes S0; 4%2=0 S0. Hmm 0,2,4 all S0.
  const steps = buildSimulation({ numLines: 4, technique: 'set',
    associativity: 2, policy: 'LRU', sequence: [0, 2, 0, 4] });
  check('LRU 0,2,0,4 = M,M,H,M', JSON.stringify(results(steps)) === JSON.stringify(['MISS', 'MISS', 'HIT', 'MISS']),
    JSON.stringify(results(steps)));
  // after hit on 0 (t3), LRU victim for 4 is block 2 (last used t2)
  check('LRU evicts block 2, keeps block 0', steps[4].evicted === 2 && steps[4].lines[0].block === 0,
    'evicted=' + steps[4].evicted);
}

/* ---------- 9. Statistics consistency at every step ---------- */
{
  const seq = [0, 0, 8, 8, 4, 4, 0, 8, 4, 12, 12, 4];
  const steps = buildSimulation({ numLines: 8, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: seq });
  let h = 0, m = 0;
  let ok = true;
  steps.slice(1).forEach((s, i) => {
    if (s.result === 'HIT') h++; else m++;
    if (s.hits !== h || s.misses !== m || s.hits + s.misses !== i + 1) ok = false;
  });
  check('hits+misses == accesses at every step', ok);
  const last = steps[steps.length - 1];
  check('final stats: 5 hits + 7 misses = 12', last.hits === 5 && last.misses === 7,
    'hits=' + last.hits + ' misses=' + last.misses);
  check('hit ratio 41.7%', Math.abs((last.hits / (last.hits + last.misses)) * 100 - 500 / 12) < 0.1);
}

/* ---------- 9b. Direct thrashing: 0,8,0,8... with 8 lines is all misses ---------- */
{
  const steps = buildSimulation({ numLines: 8, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: [0, 8, 0, 8, 4, 12, 4, 0, 8] });
  check('thrashing sequence all MISS (0 hits)', steps[steps.length - 1].hits === 0 &&
    steps[steps.length - 1].misses === 9);
}

/* ---------- 10. Snapshot restore (Previous Step correctness) ---------- */
{
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push(Math.floor(Math.random() * 16));
  ['direct', 'fully', 'set'].forEach(t => {
    const steps = buildSimulation({ numLines: 8, technique: t,
      associativity: t === 'set' ? 2 : 1, policy: 'LRU', sequence: seq });
    let ok = true;
    for (let k = 0; k < steps.length; k++) {
      if (steps[k].hits + steps[k].misses !== Math.max(0, k)) ok = false;
    }
    // walk forward then "back" and confirm snapshots match a fresh replay
    const replay = buildSimulation({ numLines: 8, technique: t,
      associativity: t === 'set' ? 2 : 1, policy: 'LRU', sequence: seq });
    let same = true;
    for (let k = 0; k < steps.length; k++) {
      if (JSON.stringify(steps[k].lines) !== JSON.stringify(replay[k].lines)) same = false;
    }
    check('snapshots deterministic for ' + t, same && ok);
  });
}

/* ---------- 11. Empty sequence -> single initial step only ---------- */
{
  const steps = buildSimulation({ numLines: 4, technique: 'direct',
    associativity: 1, policy: 'FIFO', sequence: [] });
  check('empty sequence -> 1 step (initial), zero stats', steps.length === 1 &&
    steps[0].index === -1 && steps[0].hits === 0 && steps[0].misses === 0);
}

/* ---------- 12. Associativity = numLines behaves like fully associative ---------- */
{
  const steps = buildSimulation({ numLines: 4, technique: 'set',
    associativity: 4, policy: 'FIFO', sequence: [0, 4, 0] });
  // 1 set: 0 -> way0, 4 -> way1, 0 -> HIT
  check('4-way 1-set: 0,4,0 = M,M,H', JSON.stringify(results(steps)) === JSON.stringify(['MISS', 'MISS', 'HIT']),
    JSON.stringify(results(steps)));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
