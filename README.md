# Interactive Cache Memory Mapping Simulator

A fully offline web simulator for the three cache mapping techniques — **Direct**, **Fully Associative**
and **Set-Associative** — with step-by-step simulation, hit/miss statistics, FIFO and LRU replacement,
visualisation of cache lines / sets / ways, a theory section and a flowchart.

Built for the **Computer Organization & Architecture (CO5) Micro Project, SY CSE**.

---

## 1. Project files

```
cache-simulator/
├── index.html      ← page structure, theory section, flowchart
├── style.css       ← dashboard styling (responsive, accessible colours)
├── script.js       ← simulation engine + user interface logic
├── README.md       ← this file
├── REPORT.md       ← full project report (abstract → viva questions)
├── test-logic.js   ← Node test suite for the simulation core (36 checks)
└── test-dom.js     ← Node test suite for the interface wiring (53 checks)
```

## 2. How to create the project

1. Make a new folder, e.g. `CacheSimulator`.
2. Save the four files inside it with exactly these names: `index.html`, `style.css`, `script.js`, `README.md`
   (add `REPORT.md` and the two test files if you want them).
3. Keep the file names unchanged — `index.html` looks for `style.css` and `script.js` in the same folder.

## 3. How to run it

**No installation, no server, no internet, no libraries are needed.**

- Double-click `index.html`, **or**
- Right-click `index.html` → *Open with* → Chrome / Edge / Firefox, **or**
- Drag `index.html` into an open browser window.

The address bar shows something like `file:///C:/.../index.html` — that is correct for a local project.

## 4. How to use it

1. Fill in your **Student Information** (name, roll number, department, university). These are saved only in
   your own browser via `localStorage`; nothing is uploaded anywhere.
2. Set the memory parameters:
   - **Main memory size** (bytes) and **Cache size** (bytes) and **Block size** (bytes).
   - Sizes must be positive whole numbers and the memory/cache sizes must be exact multiples of the block size.
   - The page instantly shows how many **blocks** and **cache lines** that produces.
3. Choose a **Mapping technique**.
   - *Set-associative* reveals an **Associativity** dropdown containing only the valid choices
     (the divisors of the number of cache lines), so an illegal combination cannot be selected.
   - *Fully associative* and *Set-associative* additionally reveal a **Replacement policy** dropdown (FIFO / LRU).
     Direct mapping hides it because direct mapping has no choice of line.
4. Type an access sequence such as `0, 8, 4, 12, 0` (block numbers separated by commas), **or** press one of
   the three **example** buttons.
5. Press **Start Simulation**, then walk through it with **Next Step** / **Previous Step**
   (the `→` and `←` arrow keys work as shortcuts too).
6. Watch four panels update together: the **step explanation** (formula, HIT/MISS and *why*), the **cache
   diagram**, the **main memory** grid (the requested block is highlighted) and the **statistics**.
7. **Reset** clears the run so you can try a new sequence with the same settings.

### Reading the cache diagram

| Column | Meaning |
|---|---|
| Set / Way | Only for set-associative: which group and which line inside it |
| Line | Physical cache line number `L0 … Ln` |
| Block held | Which main-memory block currently lives in the line, or `Empty` |
| Tag | The tag stored with that block |
| Loaded / Last used | `t=` timestamps used internally by FIFO and LRU |
| Status | `HIT`, `MISS — loaded`, `MISS — replaced Bx`, or `Checked` for lines that were searched but not chosen |

Results are never shown by colour alone: every hit/miss also carries the words **HIT**/**MISS**, and the
evicted block is named in text.

## 5. The formulas implemented

| Technique | Placement rule | Tag |
|---|---|---|
| Direct | `line = block % number_of_cache_lines` | `floor(block / number_of_cache_lines)` |
| Fully associative | any empty line, else FIFO/LRU victim among all lines | the block number itself |
| Set-associative | `set = block % number_of_sets`, any way in that set | `floor(block / number_of_sets)` |

`number_of_cache_lines = cache_size / block_size` and `number_of_sets = number_of_cache_lines / associativity`.

## 6. How to test it

### 6.1 Manual testing (in the browser)

Run these cases and confirm the results shown by the simulator:

| # | Setup | Sequence | Expected |
|---|---|---|---|
| 1 | Direct, 8 lines | `5, 5, 5` | MISS, HIT, HIT (hit ratio 66.7%) |
| 2 | Direct, 8 lines | `0, 8, 0` | all 3 MISS — blocks 0 and 8 collide on line 0 (conflict miss) |
| 3 | Direct, 8 lines | `0, 8, 0, 8, 4, 12, 4, 0, 8` | all 9 MISS, hit ratio 0.0% (thrashing) |
| 4 | Fully assoc., 4 lines, LRU | `0, 1, 2, 3, 0, 4, 0` | MISS MISS MISS MISS **HIT** MISS **HIT** |
| 5 | Fully assoc., 2 lines, FIFO | `0, 1, 0, 2, 1` | MISS MISS HIT MISS **HIT** |
| 6 | Fully assoc., 2 lines, LRU | `0, 1, 0, 2, 1` | MISS MISS HIT MISS **MISS** (LRU evicted block 1) |
| 7 | Set-assoc., 8 lines, 2-way | `0, 4, 8, 12` | 4 MISS, only set 0 changes; sets 1–3 stay empty |
| 8 | Set-assoc., 8 lines, 2-way | `13` | set = 13 % 4 = **1**, tag = floor(13 / 4) = **3** |
| 9 | Any | empty sequence | error: *"The access sequence is empty…"* |
| 10 | Any | `0, 40` with 32 blocks | error: *"Block 40 does not exist… valid … 0 to 31"* |
| 11 | Cache 130 B, block 16 B | — | error: *"must be an exact multiple of the block size"* |
| 12 | 6 lines, 4-way | — | error: *"number of cache lines (6) must be divisible by the associativity"* |
| 13 | Any run | press **Previous Step** repeatedly | statistics and cache roll back exactly to the empty initial state |
| 14 | Any run | Next → Previous → Next | same result both times (state is a snapshot, not a recompute) |

Also verify **hits + misses = total accesses** and **hit ratio + miss ratio = 100%** at every step.

### 6.2 Automatic testing (optional, needs Node.js)

```bash
node test-logic.js   # 36 checks on the mapping/replacement/statistics engine
node test-dom.js     # 53 checks on the interface: validation, buttons, rendering, rollback
```

Both must print `0 failed`. `test-logic.js` covers every case listed in section 13 of the project brief,
including FIFO vs LRU divergence, snapshot rollback determinism and the empty-sequence case.

## 7. Demonstration script for faculty (about 5 minutes)

1. **Introduce** the problem: the CPU is far faster than RAM, so we cache blocks — but where does a block go?
2. Leave **Direct mapping** selected, press **Direct example** → *Start Simulation* → *Next Step*.
   Block 0 loads into line 0. Then block 8 → *same* line 0 → **MISS**, and block 0 is evicted. Say: *"this is a
   conflict miss — the cache is mostly empty but these two blocks fight over one line."*
3. Step to the end: hit ratio **0%**. Point at the statistics panel.
4. Switch to **Fully associative**, press **Fully associative example**, run it. Show that block 4 goes into a
   free line and that a later access to block 0 is still a **HIT** because 0 was never forced out.
   Explain LRU: the *Last used* `t=` column is what the algorithm compares.
5. Switch **Policy** to FIFO, re-run, and show the different victim — the hit ratio changes.
6. Switch to **Set-associative**, 2-way. Use sequence `0, 4, 8, 12`: all four map to **set 0**, only set 0
   changes, the other sets stay empty. Point out this is the compromise real CPUs use.
7. Open the **Theory** and **Flowchart** sections and walk through one worked example (block 13).
8. Show a validation error live: type `40` for the block number and explain the message.

## 8. Explaining the code in simple English

- **`index.html`** — the skeleton. It holds the input boxes, the empty panels the JavaScript fills in, the
  theory text and the flowchart made of plain `div` boxes and arrows.
- **`style.css`** — the look. It defines the colours once as CSS variables (`--hit`, `--miss`, `--accent`) and
  lays the panels out with CSS Grid so they stack on small screens. Green/amber are always paired with the
  words HIT/MISS.
- **`script.js`** has two halves:
  1. **The engine (top half, no DOM).** `buildSimulation()` receives the configuration, then replays the whole
     access sequence once. For each access it calls `runDirectStep()`, `runFullyStep()` or `runSetStep()`, which
     apply the formula, compare tags, update the cache array and write a plain-English explanation. Each cache
     line is `{ block, tag, loadTime, lastUsed }`; `loadTime` serves FIFO and `lastUsed` serves LRU, and
     `chooseVictim()` simply picks the smallest one. Because every step stores a **snapshot** of the cache,
     *Previous Step* cannot drift out of sync — it just re-renders an older snapshot.
  2. **The interface (bottom half).** `validateInputs()` checks sizes, divisibility, associativity and block
     numbers and produces human-readable messages. `renderCache()`, `renderMemory()`, `renderStats()` and
     `renderHistory()` paint the four panels from the current step, and button handlers move `currentStep`
     forward or back.
- Because the engine is separated from the DOM, it can be tested in Node.js without a browser — that is what
  `test-logic.js` does.

## 9. Notes and limitations

- Sizes are in bytes and are deliberately small so the whole memory fits on screen; real systems use KB/MB.
- Only the block number is modelled (no byte-level address splitting into tag/line/offset fields, no write
  policies, no multi-level caches). See *Future scope* in `REPORT.md`.
- The display caps at 128 cache lines / 512 memory blocks for speed, but the simulation logic still uses every
  line and block.
