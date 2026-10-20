'use strict';

/* ============================================================================
   Interactive Cache Memory Mapping Simulator — script.js

   Part 1 (top): the pure simulation core. No DOM access, so it can be unit
   tested in Node.js.
   Part 2 (bottom): the browser application (DOM wiring, rendering).
   ============================================================================ */

/* --------------------------------------------------------------------------
   Part 1 — Pure simulation core
   -------------------------------------------------------------------------- */

const TECHNIQUES = { DIRECT: 'direct', FULLY: 'fully', SET: 'set' };
const POLICIES = { FIFO: 'FIFO', LRU: 'LRU' };

const MAX_RENDER_LINES = 128;   // display cap only — logic always uses all lines
const MAX_RENDER_BLOCKS = 512;  // display cap only — logic always uses all blocks
const MAX_ACCESSES = 500;

/** Create numLines empty cache lines. */
function createEmptyLines(numLines) {
  return Array.from({ length: numLines }, () => ({
    block: null,   // memory block number currently stored here (null = empty)
    tag: null,     // tag bits stored with the line
    loadTime: null,// clock time when the block was loaded (for FIFO)
    lastUsed: null // clock time of most recent use (for LRU)
  }));
}

/**
 * Choose a victim line among `candidates` (array of line indices).
 * FIFO -> smallest loadTime (oldest load). LRU -> smallest lastUsed (least recent use).
 */
function chooseVictim(lines, candidates, policy) {
  let best = candidates[0];
  for (const i of candidates) {
    const better = policy === POLICIES.LRU
      ? lines[i].lastUsed < lines[best].lastUsed
      : lines[i].loadTime < lines[best].loadTime;
    if (better) best = i;
  }
  return best;
}

/** Deep-copied snapshot of the cache + statistics at one point in time. */
function takeSnapshot(lines, hits, misses) {
  return {
    lines: lines.map(l => ({ ...l })),
    hits: hits,
    misses: misses
  };
}

/**
 * Build the full list of simulation steps.
 *
 * cfg = { numLines, technique, associativity, policy, sequence }
 * Returns an array of steps. steps[0] is the initial state (empty cache,
 * index -1). steps[k] (k >= 1) holds the state AFTER processing access k-1,
 * including the cache snapshot — so moving "previous" is just rendering an
 * earlier snapshot, which is always correct.
 *
 * Every step records: index, block, clock, result ('HIT'/'MISS'/null),
 * lineIndex, setIndex, wayIndex, searched (line indices examined), evicted
 * (block number or null), tag, calc (formula text), action, explanation,
 * plus the snapshot fields (lines, hits, misses).
 */
function buildSimulation(cfg) {
  const numLines = cfg.numLines;
  const technique = cfg.technique;
  const associativity = technique === TECHNIQUES.SET ? cfg.associativity : 1;
  const policy = cfg.policy;
  const numSets = technique === TECHNIQUES.SET ? numLines / associativity : 0;

  const lines = createEmptyLines(numLines);
  let hits = 0;
  let misses = 0;
  let clock = 0;
  const steps = [];

  steps.push({
    index: -1, block: null, clock: 0, result: null,
    lineIndex: null, setIndex: null, wayIndex: null,
    searched: [], evicted: null, tag: null,
    calc: '', action: '', explanation: '',
    ...takeSnapshot(lines, hits, misses)
  });

  cfg.sequence.forEach((block, index) => {
    clock++;
    const step = {
      index: index, block: block, clock: clock, result: null,
      lineIndex: null, setIndex: null, wayIndex: null,
      searched: [], evicted: null, tag: null,
      calc: '', action: '', explanation: ''
    };

    // Each helper examines the cache, fills in the step fields (result,
    // lineIndex, action, explanation, ...) and updates the cache lines.
    if (technique === TECHNIQUES.DIRECT) {
      runDirectStep(step, lines, numLines);
    } else if (technique === TECHNIQUES.FULLY) {
      runFullyStep(step, lines, numLines, policy);
    } else {
      runSetStep(step, lines, associativity, numSets, policy);
    }

    // Apply the result to the statistics counters.
    if (step.result === 'HIT') hits++; else misses++;

    steps.push({ ...step, ...takeSnapshot(lines, hits, misses) });
  });

  return steps;
}

/* Direct mapping: line = block % numLines, tag = floor(block / numLines). */
function runDirectStep(step, lines, numLines) {
  const block = step.block;
  const lineIndex = block % numLines;
  const tag = Math.floor(block / numLines);
  const line = lines[lineIndex];

  step.lineIndex = lineIndex;
  step.tag = tag;
  step.searched = [lineIndex];
  step.calc = 'Cache line = ' + block + ' % ' + numLines + ' = ' + lineIndex +
              '   |   Tag = floor(' + block + ' / ' + numLines + ') = ' + tag;

  if (line.block === block) {
    step.result = 'HIT';
    line.lastUsed = step.clock;
    step.action = 'No change — line ' + lineIndex + ' already holds block ' + block + '.';
    step.explanation =
      'In direct mapping every block has exactly one possible line. Block ' + block +
      ' maps to line ' + lineIndex + ' (' + block + ' % ' + numLines + ' = ' + lineIndex +
      '), and that line already contains block ' + block + ' with tag ' + tag +
      '. The tags match, so this is a HIT — main memory is not accessed.';
  } else {
    step.result = 'MISS';
    step.evicted = line.block; // may be null (empty line)
    line.block = block;
    line.tag = tag;
    line.loadTime = step.clock;
    line.lastUsed = step.clock;
    step.action = step.evicted === null
      ? 'Loaded block ' + block + ' into empty line ' + lineIndex + '.'
      : 'Replaced block ' + step.evicted + ' with block ' + block + ' in line ' + lineIndex + '.';
    step.explanation = step.evicted === null
      ? ('Block ' + block + ' always maps to line ' + lineIndex + ' (' + block + ' % ' + numLines +
         ' = ' + lineIndex + ', tag = ' + tag + '). The line is currently empty, so this is a MISS. ' +
         'The block is fetched from main memory and loaded into line ' + lineIndex + '.')
      : ('Block ' + block + ' maps to line ' + lineIndex + ' (' + block + ' % ' + numLines + ' = ' + lineIndex +
         ', tag = ' + tag + '), but line ' + lineIndex + ' is holding block ' + step.evicted +
         ' (tag ' + Math.floor(step.evicted / numLines) + '). Two different blocks competing for the same line ' +
         'is called a conflict, so this is a MISS. Block ' + step.evicted + ' is evicted and block ' + block +
         ' takes its place.');
  }
}

/* Fully associative mapping: tag = block number, block may go in any line. */
function runFullyStep(step, lines, numLines, policy) {
  const block = step.block;
  step.tag = block;
  step.searched = lines.map((_, i) => i);
  step.calc = 'Tag = ' + block + ' (whole block number). The hardware compares this tag with ALL ' +
              numLines + ' cache lines in parallel.';

  const found = lines.findIndex(l => l.block === block);
  if (found !== -1) {
    step.result = 'HIT';
    step.lineIndex = found;
    lines[found].lastUsed = step.clock;
    step.action = 'No change — block ' + block + ' found in line ' + found + '.';
    step.explanation =
      'A fully associative cache lets any block live in any line, so the tag ' + block +
      ' is compared with every line. Line ' + found + ' holds block ' + block +
      ', so this is a HIT.';
    return;
  }

  step.result = 'MISS';
  const empty = lines.findIndex(l => l.block === null);
  let target;
  if (empty !== -1) {
    target = empty;
    step.action = 'Loaded block ' + block + ' into empty line ' + target + '.';
    step.explanation =
      'The tag ' + block + ' was not found in any of the ' + numLines + ' lines, so this is a MISS. ' +
      'Line ' + target + ' is empty, so block ' + block + ' is placed there (no replacement needed).';
  } else {
    target = chooseVictim(lines, lines.map((_, i) => i), policy);
    step.evicted = lines[target].block;
    const meta = policy === POLICIES.LRU
      ? 'it was last used at t=' + lines[target].lastUsed + ' (the oldest use)'
      : 'it was loaded at t=' + lines[target].loadTime + ' (the oldest load)';
    step.action = 'Evicted block ' + step.evicted + ' from line ' + target +
                  ' and loaded block ' + block + '.';
    step.explanation =
      'The tag ' + block + ' was not found in any line, so this is a MISS and the cache is full. ' +
      policy + ' therefore picks line ' + target + ' as the victim (' + meta + '). Block ' +
      step.evicted + ' is replaced by block ' + block + '.';
  }
  step.lineIndex = target;
  lines[target] = { block: block, tag: block, loadTime: step.clock, lastUsed: step.clock };
}

/* Set-associative mapping: set = block % numSets, tag = floor(block / numSets). */
function runSetStep(step, lines, associativity, numSets, policy) {
  const block = step.block;
  const setIndex = block % numSets;
  const tag = Math.floor(block / numSets);
  const start = setIndex * associativity;
  const candidates = Array.from({ length: associativity }, (_, i) => start + i);

  step.setIndex = setIndex;
  step.tag = tag;
  step.searched = candidates;
  step.calc = 'Set = ' + block + ' % ' + numSets + ' = ' + setIndex +
              '   |   Tag = floor(' + block + ' / ' + numSets + ') = ' + tag +
              '   |   Search only set ' + setIndex + ' (' + associativity + ' ways: lines ' +
              candidates.join(', ') + ')';

  const found = candidates.find(i => lines[i].block === block);
  if (found !== undefined) {
    step.result = 'HIT';
    step.lineIndex = found;
    step.wayIndex = found - start;
    lines[found].lastUsed = step.clock;
    step.action = 'No change — block ' + block + ' found in set ' + setIndex +
                  ', way ' + step.wayIndex + ' (line ' + found + ').';
    step.explanation =
      'Block ' + block + ' belongs to set ' + setIndex + ' (' + block + ' % ' + numSets + ' = ' + setIndex +
      '). Inside that set the tag ' + tag + ' matches in way ' + step.wayIndex + ' (line ' + found +
      '), so this is a HIT. Only set ' + setIndex + ' had to be searched.';
    return;
  }

  step.result = 'MISS';
  const empty = candidates.find(i => lines[i].block === null);
  let target;
  if (empty !== undefined) {
    target = empty;
    step.action = 'Loaded block ' + block + ' into set ' + setIndex + ', way ' + (target - start) +
                  ' (line ' + target + ').';
    step.explanation =
      'Block ' + block + ' maps to set ' + setIndex + ' (' + block + ' % ' + numSets + ' = ' + setIndex +
      ', tag = ' + tag + '). The tag is not found in that set, so this is a MISS. Way ' + (target - start) +
      ' of set ' + setIndex + ' is empty, so the block is loaded there without any replacement.';
  } else {
    target = chooseVictim(lines, candidates, policy);
    step.evicted = lines[target].block;
    const meta = policy === POLICIES.LRU
      ? 'last used at t=' + lines[target].lastUsed
      : 'loaded at t=' + lines[target].loadTime;
    step.action = 'Evicted block ' + step.evicted + ' from set ' + setIndex + ', way ' +
                  (target - start) + ' (line ' + target + ') and loaded block ' + block + '.';
    step.explanation =
      'Block ' + block + ' maps to set ' + setIndex + ' (' + block + ' % ' + numSets + ' = ' + setIndex +
      ', tag = ' + tag + '), but the tag is not found there — a MISS. Set ' + setIndex +
      ' is full, so ' + policy + ' picks way ' + (target - start) + ' (line ' + target + ', ' + meta +
      ') as the victim. Block ' + step.evicted + ' is replaced by block ' + block + '.';
  }
  step.lineIndex = target;
  step.wayIndex = target - start;
  lines[target] = { block: block, tag: tag, loadTime: step.clock, lastUsed: step.clock };
}

/* --------------------------------------------------------------------------
   Part 2 — Browser application (runs only in a browser)
   -------------------------------------------------------------------------- */

const EXAMPLES = {
  direct: { memorySize: 512, cacheSize: 128, blockSize: 16, technique: 'direct',
            sequence: '0, 8, 0, 8, 4, 12, 4, 0, 8' },
  fully:  { memorySize: 512, cacheSize: 64, blockSize: 16, technique: 'fully',
            policy: 'LRU', sequence: '0, 1, 2, 3, 0, 4, 0' },
  set:    { memorySize: 512, cacheSize: 128, blockSize: 16, technique: 'set',
            associativity: 2, policy: 'FIFO', sequence: '0, 4, 8, 12, 0, 4, 16, 0, 8' }
};

const STUDENT_KEY = 'cacheSim.student.v1';

function initApp() {
  const $ = (id) => document.getElementById(id);
  const els = {
    stName: $('stName'), stRoll: $('stRoll'), stDept: $('stDept'), stUni: $('stUni'),
    memorySize: $('memorySize'), cacheSize: $('cacheSize'), blockSize: $('blockSize'),
    technique: $('technique'), associativity: $('associativity'), policy: $('policy'),
    assocRow: $('assocRow'), policyRow: $('policyRow'),
    sequence: $('sequence'), formulaHint: $('formulaHint'), configSummary: $('configSummary'),
    startBtn: $('startBtn'), prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), resetBtn: $('resetBtn'),
    exampleDirect: $('exampleDirect'), exampleFully: $('exampleFully'), exampleSet: $('exampleSet'),
    message: $('message'), stepContent: $('stepContent'),
    statTotal: $('statTotal'), statHits: $('statHits'), statMisses: $('statMisses'),
    statHitRatio: $('statHitRatio'), statMissRatio: $('statMissRatio'),
    hitBar: $('hitBar'), missBar: $('missBar'),
    cacheTableWrap: $('cacheTableWrap'), memoryGrid: $('memoryGrid'), memoryNote: $('memoryNote'),
    historyBody: $('historyBody')
  };

  const state = {
    steps: [],
    currentStep: 0,
    config: null,   // frozen config used by the running simulation
    preview: null   // config derived from the inputs (used to draw main memory)
  };

  /* ---------- Student information (saved locally only) ---------- */

  function loadStudent() {
    try {
      const raw = localStorage.getItem(STUDENT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      els.stName.value = s.name || '';
      els.stRoll.value = s.roll || '';
      els.stDept.value = s.dept || '';
      els.stUni.value = s.uni || '';
    } catch (e) { /* storage unavailable — leave fields empty */ }
  }

  function saveStudent() {
    try {
      localStorage.setItem(STUDENT_KEY, JSON.stringify({
        name: els.stName.value, roll: els.stRoll.value,
        dept: els.stDept.value, uni: els.stUni.value
      }));
    } catch (e) { /* ignore */ }
  }

  [els.stName, els.stRoll, els.stDept, els.stUni].forEach(el =>
    el.addEventListener('input', saveStudent));

  /* ---------- Input validation ---------- */

  function validateInputs() {
    const errors = [];
    const memorySize = parseInt(els.memorySize.value, 10);
    const cacheSize = parseInt(els.cacheSize.value, 10);
    const blockSize = parseInt(els.blockSize.value, 10);

    const sizeFields = [
      ['Main memory size', memorySize, els.memorySize.value],
      ['Cache size', cacheSize, els.cacheSize.value],
      ['Block size', blockSize, els.blockSize.value]
    ];
    for (const [label, value, raw] of sizeFields) {
      if (!Number.isInteger(value) || value <= 0) {
        errors.push(label + ' must be a positive whole number in bytes (received "' +
                    (raw.trim() === '' ? 'empty' : raw) + '").');
      }
    }
    if (errors.length > 0) return { ok: false, errors: errors };

    if (memorySize % blockSize !== 0) {
      errors.push('Main memory size (' + memorySize + ' B) must be an exact multiple of the block size (' +
                  blockSize + ' B), so that memory splits into whole blocks.');
    }
    if (cacheSize % blockSize !== 0) {
      errors.push('Cache size (' + cacheSize + ' B) must be an exact multiple of the block size (' +
                  blockSize + ' B), so that the cache splits into whole lines.');
    }
    if (cacheSize > memorySize) {
      errors.push('Cache size (' + cacheSize + ' B) cannot be larger than the main memory size (' +
                  memorySize + ' B).');
    }

    const technique = els.technique.value;
    const numBlocks = memorySize / blockSize;
    const numLines = cacheSize / blockSize;
    let associativity = 1;
    let policy = POLICIES.FIFO;

    if (technique === TECHNIQUES.SET) {
      associativity = parseInt(els.associativity.value, 10);
      if (!Number.isInteger(associativity) || associativity < 2) {
        errors.push('Choose a valid associativity (number of ways per set).');
      } else if (numLines % associativity !== 0) {
        errors.push('For ' + associativity + '-way set-associative mapping, the number of cache lines (' +
                    numLines + ') must be divisible by the associativity. Change the sizes or the associativity.');
      }
    }
    if (technique !== TECHNIQUES.DIRECT) {
      policy = els.policy.value === POLICIES.LRU ? POLICIES.LRU : POLICIES.FIFO;
    }

    const sequence = [];
    const rawSeq = els.sequence.value.trim();
    if (rawSeq === '') {
      errors.push('The access sequence is empty. Enter at least one memory block number, e.g. "0, 8, 4, 12".');
    } else {
      const parts = rawSeq.split(/[\s,;]+/).filter(Boolean);
      if (parts.length > MAX_ACCESSES) {
        errors.push('The access sequence has ' + parts.length + ' accesses; the maximum is ' +
                    MAX_ACCESSES + ' so the demonstration stays readable.');
      }
      for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 0) {
          errors.push('"' + p + '" is not a valid block number. Block numbers must be whole numbers >= 0.');
          break;
        }
        if (n >= numBlocks) {
          errors.push('Block ' + n + ' does not exist: with a ' + memorySize + ' B memory and ' + blockSize +
                      ' B blocks, the valid block numbers are 0 to ' + (numBlocks - 1) + '.');
          break;
        }
        sequence.push(n);
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      config: { numBlocks: numBlocks, numLines: numLines, technique: technique,
                associativity: associativity, policy: policy, sequence: sequence }
    };
  }

  /* ---------- Messages ---------- */

  function showErrors(errors) {
    const items = errors.map(e => '<li>' + escapeHtml(e) + '</li>').join('');
    els.message.innerHTML = '<div class="message-error"><strong>Please fix the following:</strong><ul>' +
                            items + '</ul></div>';
  }
  function showSuccess(text) {
    els.message.innerHTML = '<div class="message-success">' + escapeHtml(text) + '</div>';
  }
  function showInfo(text) {
    els.message.innerHTML = '<div class="message-info">' + escapeHtml(text) + '</div>';
  }
  function clearMessage() { els.message.innerHTML = ''; }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- Configuration-driven UI updates ---------- */

  function updateTechniqueUI() {
    const t = els.technique.value;
    els.assocRow.style.display = (t === TECHNIQUES.SET) ? '' : 'none';
    els.policyRow.style.display = (t === TECHNIQUES.DIRECT) ? 'none' : '';
    const hints = {
      direct: 'Direct mapping:  Cache line = Block % Number of cache lines,  Tag = floor(Block / Number of cache lines)',
      fully: 'Fully associative:  Tag = Block number (the block may be placed in ANY cache line)',
      set: 'Set-associative:  Set = Block % Number of sets,  Tag = floor(Block / Number of sets), then search only that set'
    };
    els.formulaHint.textContent = hints[t];
  }

  function populateAssociativity() {
    const sel = els.associativity;
    const prev = parseInt(sel.value, 10);
    sel.innerHTML = '';
    const numLines = computeNumLines();
    if (!Number.isInteger(numLines) || numLines < 2) {
      sel.disabled = true;
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Enter valid sizes first';
      sel.appendChild(o);
      return;
    }
    sel.disabled = false;
    const divisors = [];
    for (let a = 2; a <= numLines; a++) if (numLines % a === 0) divisors.push(a);
    for (const a of divisors) {
      const o = document.createElement('option');
      o.value = String(a);
      o.textContent = a + '-way (' + (numLines / a) + (numLines / a === 1 ? ' set' : ' sets') + ')';
      sel.appendChild(o);
    }
    sel.value = divisors.includes(prev) ? String(prev) : String(Math.min.apply(null, divisors));
  }

  function computeNumLines() {
    const cacheSize = parseInt(els.cacheSize.value, 10);
    const blockSize = parseInt(els.blockSize.value, 10);
    if (!Number.isInteger(cacheSize) || !Number.isInteger(blockSize) || cacheSize <= 0 || blockSize <= 0) {
      return NaN;
    }
    if (cacheSize % blockSize !== 0) return NaN;
    return cacheSize / blockSize;
  }

  function updateConfigSummary() {
    const memorySize = parseInt(els.memorySize.value, 10);
    const blockSize = parseInt(els.blockSize.value, 10);
    const numLines = computeNumLines();
    if (!Number.isInteger(numLines)) {
      els.configSummary.textContent = 'Enter compatible sizes to see the block/line counts.';
      state.preview = null;
      return;
    }
    const numBlocks = (Number.isInteger(memorySize) && memorySize > 0 && memorySize % blockSize === 0)
      ? memorySize / blockSize : NaN;
    let text = 'Cache lines: ' + numLines;
    if (Number.isInteger(numBlocks)) text = 'Main memory blocks: ' + numBlocks + '  ·  ' + text;
    const t = els.technique.value;
    if (t === TECHNIQUES.SET && !els.associativity.disabled) {
      const a = parseInt(els.associativity.value, 10);
      if (Number.isInteger(a) && a >= 2 && numLines % a === 0) {
        text += '  ·  Sets: ' + (numLines / a) + ' (' + a + '-way)';
      }
    }
    els.configSummary.textContent = text;
    state.preview = Number.isInteger(numBlocks)
      ? { numBlocks: numBlocks, numLines: numLines, technique: t,
          associativity: t === TECHNIQUES.SET ? parseInt(els.associativity.value, 10) : 1 }
      : { numBlocks: 0, numLines: numLines, technique: t, associativity: 1 };
  }

  function onConfigChange(notify) {
    populateAssociativity();
    updateTechniqueUI();
    updateConfigSummary();
    invalidateSimulation();
    renderAll();
    if (notify) showInfo('Configuration changed — press "Start Simulation" to run with the new settings.');
  }

  function invalidateSimulation() {
    state.steps = [];
    state.currentStep = 0;
    state.config = null;
  }

  /* ---------- Simulation control ---------- */

  function startSimulation() {
    const result = validateInputs();
    if (!result.ok) { showErrors(result.errors); return; }
    state.config = result.config;
    state.steps = buildSimulation(result.config);
    state.currentStep = 0;
    const c = result.config;
    const parts = [c.numBlocks + ' memory blocks', c.numLines + ' cache lines'];
    if (c.technique === TECHNIQUES.SET) parts.push((c.numLines / c.associativity) + ' sets of ' + c.associativity + ' ways');
    if (c.technique !== TECHNIQUES.DIRECT) parts.push(c.policy + ' replacement');
    showSuccess('Simulation ready: ' + c.sequence.length + ' access(es), ' + parts.join(', ') +
                '. Press "Next Step" to walk through each access.');
    renderAll();
  }

  function nextStep() {
    if (state.currentStep < state.steps.length - 1) {
      state.currentStep++;
      renderAll();
    }
  }

  function prevStep() {
    if (state.currentStep > 0) {
      state.currentStep--;
      renderAll();
    }
  }

  function resetAll() {
    invalidateSimulation();
    clearMessage();
    renderAll();
  }

  function loadExample(key) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    els.memorySize.value = ex.memorySize;
    els.cacheSize.value = ex.cacheSize;
    els.blockSize.value = ex.blockSize;
    els.technique.value = ex.technique;
    populateAssociativity();
    if (ex.associativity) els.associativity.value = String(ex.associativity);
    if (ex.policy) els.policy.value = ex.policy;
    els.sequence.value = ex.sequence;
    onConfigChange(false);
    showSuccess('Example loaded (' + key + ' mapping). Press "Start Simulation", then use "Next Step".');
  }

  /* ---------- Rendering ---------- */

  function currentStep() {
    return state.steps.length ? state.steps[state.currentStep] : null;
  }

  function renderAll() {
    const step = currentStep();
    renderStepPanel(step);
    renderCache(step);
    renderMemory(step);
    renderStats(step);
    renderHistory();
    renderButtons();
  }

  function renderStepPanel(step) {
    if (!step) {
      els.stepContent.innerHTML = '<p class="placeholder">Set the parameters above and press ' +
        '<strong>Start Simulation</strong>. Then use <strong>Next Step</strong> to process one memory ' +
        'access at a time, and <strong>Previous Step</strong> to go back.</p>';
      return;
    }
    if (step.index === -1) {
      els.stepContent.innerHTML =
        '<span class="step-badge">Ready</span>' +
        '<p class="step-block">The cache is initially <strong>EMPTY</strong>. ' +
        (state.steps.length - 1) + ' memory access(es) are waiting to be processed.</p>' +
        '<p class="step-action">Press <strong>Next Step</strong> to process access 1.</p>';
      return;
    }
    const badge = step.result === 'HIT'
      ? '<span class="badge badge-hit">HIT &#10003;</span>'
      : '<span class="badge badge-miss">MISS &#10007;</span>';
    els.stepContent.innerHTML =
      '<span class="step-badge">Step ' + (step.index + 1) + ' of ' + (state.steps.length - 1) + '</span>' +
      '<p class="step-block">CPU requests <code>Block ' + step.block + '</code> ' + badge + '</p>' +
      '<p class="step-calc">' + escapeHtml(step.calc) + '</p>' +
      '<p class="step-explanation">' + escapeHtml(step.explanation) + '</p>' +
      '<p class="step-action"><strong>Action:</strong> ' + escapeHtml(step.action) + '</p>';
  }

  function renderCache(step) {
    const cfg = state.config;
    if (!cfg) {
      els.cacheTableWrap.innerHTML = '<p class="placeholder">The cache diagram will appear here after you start the simulation.</p>';
      return;
    }
    const lines = step ? step.lines : createEmptyLines(cfg.numLines);
    const rowsToShow = Math.min(lines.length, MAX_RENDER_LINES);
    const isSet = cfg.technique === TECHNIQUES.SET;

    let html = '<div class="table-scroll"><table class="cache-table">' +
      '<caption class="visually-hidden">Cache memory contents</caption><thead><tr>';
    if (isSet) html += '<th>Set</th><th>Way</th>';
    html += '<th>Line</th><th>Block held</th><th>Tag</th>';
    if (cfg.technique !== TECHNIQUES.DIRECT) html += '<th>Loaded</th><th>Last used</th>';
    html += '<th>Status</th></tr></thead><tbody>';

    for (let i = 0; i < rowsToShow; i++) {
      const l = lines[i];
      const classes = [];
      if (step && step.index >= 0) {
        if (i === step.lineIndex) classes.push(step.result === 'HIT' ? 'row-hit' : 'row-miss');
        else if (step.searched.indexOf(i) !== -1) classes.push('row-searched');
      }
      if (isSet && i % cfg.associativity === 0) classes.push('set-start');

      html += '<tr class="' + classes.join(' ') + '">';
      if (isSet) {
        if (i % cfg.associativity === 0) {
          html += '<td rowspan="' + cfg.associativity + '" class="set-cell">Set ' +
                  Math.floor(i / cfg.associativity) + '</td>';
        }
        html += '<td>W' + (i % cfg.associativity) + '</td>';
      }
      html += '<td>L' + i + '</td>';
      html += '<td>' + (l.block === null ? '<span class="empty">Empty</span>' : '<strong>Block ' + l.block + '</strong>') + '</td>';
      html += '<td>' + (l.tag === null ? '—' : l.tag) + '</td>';
      if (cfg.technique !== TECHNIQUES.DIRECT) {
        html += '<td>' + (l.loadTime === null ? '—' : 't=' + l.loadTime) + '</td>';
        html += '<td>' + (l.lastUsed === null ? '—' : 't=' + l.lastUsed) + '</td>';
      }
      let status = '';
      if (step && step.index >= 0) {
        if (i === step.lineIndex) {
          status = step.result === 'HIT'
            ? '<span class="badge badge-hit">HIT</span>'
            : '<span class="badge badge-miss">MISS' + (step.evicted !== null ? ' — replaced B' + step.evicted : ' — loaded') + '</span>';
        } else if (step.searched.indexOf(i) !== -1) {
          status = '<span class="empty">Checked</span>';
        }
      }
      html += '<td>' + status + '</td></tr>';
    }
    html += '</tbody></table></div>';
    if (lines.length > rowsToShow) {
      html += '<p class="note">Showing the first ' + rowsToShow + ' of ' + lines.length +
              ' lines (display limit — the simulation logic still uses every line).</p>';
    }
    els.cacheTableWrap.innerHTML = html;
  }

  function renderMemory(step) {
    const p = state.preview;
    if (!p || !Number.isInteger(p.numBlocks) || p.numBlocks <= 0) {
      els.memoryGrid.innerHTML = '<p class="placeholder">Enter compatible sizes to see the main memory blocks.</p>';
      els.memoryNote.textContent = '';
      return;
    }
    const show = Math.min(p.numBlocks, MAX_RENDER_BLOCKS);
    const numSets = (p.technique === TECHNIQUES.SET && Number.isInteger(p.associativity) && p.associativity >= 2)
      ? p.numLines / p.associativity : 0;
    let html = '';
    for (let b = 0; b < show; b++) {
      let sub, title;
      if (p.technique === TECHNIQUES.DIRECT) {
        sub = 'L' + (b % p.numLines);
        title = 'Block ' + b + ' always maps to cache line ' + (b % p.numLines);
      } else if (p.technique === TECHNIQUES.SET && numSets > 0) {
        sub = 'S' + (b % numSets);
        title = 'Block ' + b + ' maps to set ' + (b % numSets);
      } else {
        sub = 'any';
        title = 'Block ' + b + ' can be placed in any cache line (tag = ' + b + ')';
      }
      const cur = (step && step.block === b) ? ' mem-current' : '';
      html += '<div class="mem-cell' + cur + '" title="' + title + '">' +
              '<span class="mem-num">' + b + '</span><span class="mem-sub">' + sub + '</span></div>';
    }
    els.memoryGrid.innerHTML = html;
    let note = p.numBlocks + ' blocks of ' + els.blockSize.value + ' B each.';
    if (p.numBlocks > show) note = 'Showing the first ' + show + ' of ' + p.numBlocks + ' blocks. ';
    note += ' The small label under each block shows where it maps (L = line, S = set, “any” = any line).';
    els.memoryNote.textContent = note;
  }

  function pct(part, total) {
    return total === 0 ? 0 : (part / total) * 100;
  }

  function renderStats(step) {
    const hits = step ? step.hits : 0;
    const misses = step ? step.misses : 0;
    const total = hits + misses;
    els.statTotal.textContent = total;
    els.statHits.textContent = hits;
    els.statMisses.textContent = misses;
    els.statHitRatio.textContent = pct(hits, total).toFixed(1) + '%';
    els.statMissRatio.textContent = pct(misses, total).toFixed(1) + '%';
    els.hitBar.style.width = pct(hits, total) + '%';
    els.missBar.style.width = pct(misses, total) + '%';
  }

  function locationText(step, cfg) {
    if (cfg.technique === TECHNIQUES.SET) {
      return 'Set ' + step.setIndex + ' · Way ' + step.wayIndex + ' (L' + step.lineIndex + ')';
    }
    return 'Line ' + step.lineIndex;
  }

  function renderHistory() {
    if (!state.steps.length || state.currentStep === 0) {
      els.historyBody.innerHTML = '<tr><td colspan="5" class="placeholder">No accesses processed yet.</td></tr>';
      return;
    }
    const cfg = state.config;
    let html = '';
    for (let k = 1; k <= state.currentStep; k++) {
      const s = state.steps[k];
      const badge = s.result === 'HIT'
        ? '<span class="badge badge-hit">HIT</span>'
        : '<span class="badge badge-miss">MISS</span>';
      const rowClass = (k === state.currentStep) ? ' class="row-current"' : '';
      html += '<tr' + rowClass + '><td>' + (s.index + 1) + '</td><td>Block ' + s.block + '</td><td>' +
              escapeHtml(locationText(s, cfg)) + '</td><td>' + badge + '</td><td>' +
              escapeHtml(s.action) + '</td></tr>';
    }
    els.historyBody.innerHTML = html;
  }

  function renderButtons() {
    const hasSim = state.steps.length > 0;
    els.prevBtn.disabled = !hasSim || state.currentStep <= 0;
    els.nextBtn.disabled = !hasSim || state.currentStep >= state.steps.length - 1;
  }

  /* ---------- Event wiring ---------- */

  [els.memorySize, els.cacheSize, els.blockSize, els.sequence].forEach(el =>
    el.addEventListener('input', () => onConfigChange(true)));
  [els.technique, els.associativity, els.policy].forEach(el =>
    el.addEventListener('change', () => onConfigChange(true)));

  els.startBtn.addEventListener('click', startSimulation);
  els.nextBtn.addEventListener('click', nextStep);
  els.prevBtn.addEventListener('click', prevStep);
  els.resetBtn.addEventListener('click', resetAll);
  els.exampleDirect.addEventListener('click', () => loadExample('direct'));
  els.exampleFully.addEventListener('click', () => loadExample('fully'));
  els.exampleSet.addEventListener('click', () => loadExample('set'));

  // Keyboard shortcuts: Right arrow = next step, Left arrow = previous step.
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight') nextStep();
    else if (e.key === 'ArrowLeft') prevStep();
  });

  /* ---------- Init ---------- */
  loadStudent();
  onConfigChange(false);
}

/* --------------------------------------------------------------------------
   Exports / bootstrap
   -------------------------------------------------------------------------- */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSimulation, chooseVictim, createEmptyLines, TECHNIQUES, POLICIES };
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
