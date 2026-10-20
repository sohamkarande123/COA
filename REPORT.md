# Project Report

## Interactive Cache Memory Mapping Simulator

**Subject:** Computer Organization & Architecture (COA) — CO5 Micro Project
**Course:** Second Year Computer Science Engineering

| Field | Value (fill in before submission) |
|---|---|
| Student Name | ................................................ |
| Roll Number | ................................................ |
| Department | Computer Science & Engineering |
| University / College | ................................................ |
| Academic Year | ................................................ |

---

## 1. Abstract

Main memory (RAM) is far slower than the CPU, so modern computers insert a small, fast memory called
**cache** between them. The critical design question is: *when a block is fetched from main memory, where
in the cache is it placed?* This project implements an interactive, browser-based simulator of the three
classical answers — **Direct Mapping**, **Fully Associative Mapping** and **Set-Associative Mapping** — together
with the **FIFO** and **LRU** replacement policies.

The user specifies main memory size, cache size, block size, mapping technique, associativity, replacement
policy and a sequence of memory-block accesses. The simulator then processes the sequence **one access at a
time**, showing the arithmetic used (`line = block % number_of_lines`, `tag = floor(block / number_of_lines)`,
and their set-associative equivalents), whether the access is a **HIT** or a **MISS**, the reason for that
result, and the exact cache line that was loaded or whose block was evicted. A live cache diagram, a main
memory block map, a running hit-ratio/miss-ratio statistics panel and a complete access history accompany
every step. *Previous Step* rewinds the simulation exactly, because every step stores a full snapshot of the
cache rather than relying on re-computation.

The project is written in pure HTML, CSS and JavaScript with no libraries, no backend and no internet
connection, so it runs from a double-click during a live demonstration. All logic was verified with two
automated Node.js test suites (36 engine checks and 53 interface checks, all passing).

---

## 2. Introduction

A CPU executing at several gigahertz would waste most of its time waiting for RAM, which is roughly a hundred
times slower. Cache memory solves this by keeping **copies of the blocks that are likely to be needed again
soon**, exploiting the **principle of locality** (programs tend to reuse the data and instructions they used
a moment ago, and data near them).

Both main memory and cache are divided into equal-sized chunks: **blocks** in main memory, **lines** (or
frames) in the cache. When the CPU needs a block that is already in the cache, the access is served in a few
nanoseconds — a **hit**. Otherwise the block must be fetched from RAM — a **miss** — and the whole block is
brought into the cache. Since the cache is much smaller than memory, many blocks compete for few lines, and
a **mapping function** decides which block may live where. Each line also stores a **tag** identifying which
block it currently holds, plus a valid bit.

The three mapping functions trade **hardware cost** against **flexibility**:

- **Direct mapping** gives each block exactly one home line — cheapest, but two competing blocks thrash.
- **Fully associative mapping** allows any line — fewest misses, but needs a comparator per line and a
  replacement algorithm.
- **Set-associative mapping** groups lines into sets and allows any line within one set — the compromise used
  by essentially all real processors.

A beginner normally learns these rules from static diagrams, and the difficulty is seeing the *consequences*:
the same access sequence produces very different hit ratios under different mappings and policies. This
project makes that cause-and-effect visible, step by step, with adjustable parameters, which is the reason
for building the simulator.

---

## 3. Problem Statement

Second-year students find cache mapping abstract because textbooks present it as fixed numerical examples
rather than as an interactive process. There is a need for a tool that:

1. correctly implements the placement formulas for all three mapping techniques,
2. lets the student change memory size, cache size, block size, associativity and replacement policy,
3. explains **each individual access** — the calculation, the HIT/MISS verdict, the reason and the eviction,
4. moves forwards *and* backwards one step at a time while keeping the cache contents and statistics
   perfectly consistent, and
5. runs on any college laboratory machine with no installation, internet connection or external library.

---

## 4. Objectives

1. To build an interactive web simulator demonstrating direct, fully associative and set-associative mapping.
2. To implement and display the correct formulas: `line = block mod number_of_lines`,
   `set = block mod number_of_sets`, `tag = floor(block / number_of_lines or sets)`.
3. To implement FIFO and LRU replacement and let the student compare their hit ratios on identical input.
4. To visualise cache lines, sets and ways, main memory blocks, hits, misses and replacement events.
5. To provide step-by-step control (Start, Next Step, Previous Step, Reset) with an access history.
6. To compute and display total accesses, hits, misses, hit ratio and miss ratio safely, including zero
   accesses.
7. To validate all inputs and explain invalid input in plain language.
8. To include a theory section, worked examples, a comparison table and a flowchart for self-study and viva
   preparation.

---

## 5. System Requirements

| Requirement | Minimum |
|---|---|
| Hardware | Any PC/laptop, 1 GB RAM, 100 MB free disk |
| Operating System | Windows, Linux or macOS |
| Software | A modern web browser (Chrome, Edge or Firefox) |
| Processor | Any x86 / ARM processor |
| Internet | **Not required** — the project is 100% offline |
| Backend / Database | **None** — static files only |
| External libraries | **None** — plain HTML, CSS, JavaScript |
| Optional (for automated tests) | Node.js 16+ to run `test-logic.js` and `test-dom.js` |

---

## 6. Methodology

The project follows a **model–view separation** inside a single JavaScript file:

1. **Model (pure logic).** `buildSimulation(config)` takes the number of cache lines, the technique,
   associativity, policy and the access sequence, then replays the entire sequence once from an empty cache.
   For each access it calls one of three helpers — `runDirectStep`, `runFullyStep`, `runSetStep` — which
   apply the mapping formula, search the relevant line(s), compare tags, update the cache array and write a
   plain-English explanation. Every step is stored as an immutable object containing the step metadata **and a
   deep-copy snapshot of the whole cache and the running statistics**.
2. **View (DOM rendering).** `renderCache`, `renderMemory`, `renderStats`, `renderHistory` and
   `renderStepPanel` draw the current step from its snapshot. Stepping forward or back only changes the index
   of the snapshot being displayed, which is what makes *Previous Step* exactly correct and symmetric with
   *Next Step*.
3. **Validation layer.** Before building, `validateInputs()` checks that all sizes are positive integers,
   that memory and cache sizes are exact multiples of the block size, that cache ≤ memory, that the chosen
   associativity divides the number of cache lines, and that every entered block number exists. The
   associativity dropdown is pre-populated with only the valid divisors, so an illegal combination is
   impossible to select through the interface.
4. **Configuration safety.** Any change to a parameter invalidates the running simulation and requires a new
   *Start Simulation*, so displayed results can never disagree with the displayed settings.
5. **Verification.** The logic was tested with two Node.js suites: 36 assertions on the engine (formulas,
   conflicts, FIFO/LRU divergence, statistics consistency, snapshot determinism, empty sequences) and 53
   assertions on the interface (validation messages, button enable/disable behaviour, rendering of sets and
   ways, rollback, example buttons, reset, and escaping of user-entered text).

---

## 7. Algorithms

### 7.1 Common setup

```
number_of_memory_blocks = main_memory_size / block_size
number_of_cache_lines   = cache_size       / block_size
number_of_sets          = number_of_cache_lines / associativity
cache = array of number_of_cache_lines entries, each { block = null, tag = null, loadTime = null, lastUsed = null }
hits = 0 ; misses = 0 ; clock = 0
```

### 7.2 Direct mapping

```
for each requested block B:
    clock = clock + 1
    L = B mod number_of_cache_lines
    T = floor(B / number_of_cache_lines)
    if cache[L].block == B:
        HIT   ; hits = hits + 1 ; cache[L].lastUsed = clock
    else:
        MISS  ; misses = misses + 1
        evict cache[L].block if present          // forced replacement, no policy needed
        cache[L] = { block = B, tag = T, loadTime = clock, lastUsed = clock }
```

### 7.3 Fully associative mapping

```
for each requested block B:
    clock = clock + 1
    tag = B                                   // the whole block number is the tag
    found = index of the line whose block == B  (search ALL lines in parallel)
    if found exists:
        HIT   ; hits = hits + 1 ; cache[found].lastUsed = clock
    else:
        MISS  ; misses = misses + 1
        target = an empty line if one exists
        else:
            if FIFO: target = line with minimum loadTime   (oldest loaded block)
            if LRU : target = line with minimum lastUsed   (least recently used)
        evict cache[target].block
        cache[target] = { block = B, tag = B, loadTime = clock, lastUsed = clock }
```

### 7.4 Set-associative mapping

```
for each requested block B:
    clock = clock + 1
    S = B mod number_of_sets
    T = floor(B / number_of_sets)
    ways = lines of set S: { S*associativity , ... , S*associativity + associativity - 1 }
    if any line in ways holds block B:
        HIT   ; hits = hits + 1 ; that line's lastUsed = clock
    else:
        MISS  ; misses = misses + 1
        target = an empty way in S if one exists
        else:
            if FIFO: target = way of set S with minimum loadTime
            if LRU : target = way of set S with minimum lastUsed
        evict cache[target].block
        cache[target] = { block = B, tag = T, loadTime = clock, lastUsed = clock }
```

### 7.5 Statistics

```
total_accesses = hits + misses
hit_ratio  = hits   / total_accesses * 100      // defined as 0 when total_accesses = 0
miss_ratio = misses / total_accesses * 100
```

---

## 8. Flowchart

```
        +----------------------------------+
        |   CPU requests a memory block    |
        +----------------------------------+
                        |
                        v
        +----------------------------------+
        |  Is the block present in cache?  |
        |  (mapped line / set, or all lines)|
        +----------------------------------+
            |                        |
     YES — HIT                  NO — MISS
            |                        |
            v                        v
  +---------------------+   +--------------------------------+
  | Serve from cache    |   | Choose a cache location        |
  | (update LRU time)   |   | direct: fixed line             |
  +---------------------+   | set-assoc: any way of the set  |
            |               | fully: any line (FIFO/LRU)     |
            |               +--------------------------------+
            |                         |
            |                         v
            |               +--------------------------------+
            |               | Fetch block from main memory   |
            |               | load it / replace victim block |
            |               +--------------------------------+
            |                         |
            +------------+------------+
                         v
        +----------------------------------+
        | Update statistics and display    |
        | (hits, misses, hit/miss ratio)   |
        +----------------------------------+
                         |
                         v
        +----------------------------------+
        | Process the next request  -----> back to the top
        +----------------------------------+
```

The same flowchart is also implemented graphically in `index.html` (section 8 of the page) using styled
HTML boxes and arrows, so it can be shown on screen without an image file.

---

## 9. Implementation summary

| File | Contents |
|---|---|
| `index.html` | Student information fields, configuration form, step panel, statistics panel, cache table, main memory grid, access history, theory section (7.1–7.8) and flowchart |
| `style.css` | Card-based responsive dashboard layout, CSS variables for a consistent colour scheme, HIT/MISS badges, set/way table styling, memory grid, flowchart styling |
| `script.js` | Pure simulation engine (`buildSimulation`, `runDirectStep`, `runFullyStep`, `runSetStep`, `chooseVictim`) and the DOM application (`validateInputs`, render functions, event handlers, example loader, localStorage student info) |
| `test-logic.js` | 36 automated checks of the engine, run with `node test-logic.js` |
| `test-dom.js` | 53 automated checks of the interface, run with `node test-dom.js` |

Key implementation decisions:

- **Snapshots per step** rather than incremental undo, guaranteeing that *Previous Step* restores the exact
  earlier state.
- **Timestamps (`loadTime`, `lastUsed`)** as the FIFO/LRU bookkeeping, and they are shown in the cache table so
  the student can see *why* a particular line was chosen as the victim.
- **Associativity options generated from the divisors** of the cache line count, so the divisibility rule is
  enforced by construction as well as by validation.
- **All user-entered text is escaped** before being inserted into the page.

---

## 10. Test cases and results

All cases below were verified by `node test-logic.js` (36/36 passing) and `node test-dom.js` (53/53 passing),
and are reproducible in the browser with the settings shown.

| # | Test | Settings | Input sequence | Expected | Result |
|---|---|---|---|---|---|
| 1 | Repeated access to same block | Direct, 8 lines | `5, 5, 5` | MISS, HIT, HIT; hits 2, misses 1, hit ratio 66.7% | Pass |
| 2 | Two blocks on one line | Direct, 8 lines | `0, 8, 0` | 3 MISS; step 3 evicts block 8 from line 0 | Pass |
| 3 | Conflict thrashing (default example) | Direct, 8 lines | `0, 8, 0, 8, 4, 12, 4, 0, 8` | 9 MISS, hits 0, hit ratio 0.0% | Pass |
| 4 | Tag/line formula | Direct, 8 lines | `13` | line 5, tag 1 | Pass |
| 5 | Empty cache filling | Fully assoc., 2 lines | `3, 7` | 2 MISS, no eviction, lines 0 and 1 used, tags 3 and 7 | Pass |
| 6 | FIFO replacement | Fully assoc., 2 lines, FIFO | `0, 1, 0, 2, 1` | MISS MISS HIT MISS HIT; step 4 evicts block 0 | Pass |
| 7 | LRU replacement | Fully assoc., 2 lines, LRU | `0, 1, 0, 2, 1` | MISS MISS HIT MISS MISS; step 4 evicts block 1 | Pass |
| 8 | Policy comparison | Fully assoc., 4 lines, LRU | `0, 1, 2, 3, 0, 4, 0` | MISS MISS MISS MISS HIT MISS HIT (hits 2, misses 5) | Pass |
| 9 | Set/tag formula | Set-assoc., 8 lines, 2-way (4 sets) | `13` | set 1, tag 3, only lines 2 and 3 searched | Pass |
| 10 | Conflict inside one set | Set-assoc., 8 lines, 2-way, FIFO | `0, 4, 8, 12` | 4 MISS; only set 0 modified, sets 1–3 remain empty | Pass |
| 11 | LRU inside a set | Set-assoc., 4 lines, 2-way, LRU | `0, 2, 0, 4` | MISS MISS HIT MISS; evicts block 2 and keeps block 0 | Pass |
| 12 | Associativity = lines (= fully assoc.) | Set-assoc., 4 lines, 4-way | `0, 4, 0` | MISS MISS HIT | Pass |
| 13 | Statistics invariant | Any technique | 40 random accesses | hits + misses = total at every step for all three techniques | Pass |
| 14 | Cache completely full | Direct, 8 lines | `0…7` then `8…15` | 16 MISS, every line replaced exactly once | Pass |
| 15 | Different cache sizes | Direct, 4 / 8 / 16 lines | same sequence | placement matches `block mod lines` | Pass |
| 16 | Different block sizes | 8 B / 16 B / 32 B | same sequence | block counts 64 / 32 / 16, formulas unchanged | Pass |
| 17 | Empty access sequence | Any | *(blank)* | error: “The access sequence is empty…” | Pass |
| 18 | Block number out of range | 32 blocks | `0, 40` | error: “Block 40 does not exist … 0 to 31” | Pass |
| 19 | Non-multiple cache size | cache 130 B, block 16 B | `0, 1` | error: “must be an exact multiple of the block size” | Pass |
| 20 | Cache larger than memory | memory 512 B, cache 1024 B | `0` | error: “Cache size … cannot be larger than …” | Pass |
| 21 | Invalid associativity | 6 cache lines, 4-way | `0, 4` | error: “number of cache lines (6) must be divisible by the associativity”; dropdown offers only 2, 3, 6 | Pass |
| 22 | Zero / negative / non-numeric size | cache size `-8` | — | error: “Cache size must be a positive whole number” | Pass |
| 23 | Previous Step consistency | Direct, 8 lines | default example | stepping back restores step 8 statistics (8 accesses) and re-advancing reproduces step 9 exactly | Pass |
| 24 | Full rewind | Direct, 8 lines | default example | 9× Previous Step returns to the empty initial state, statistics 0/0/0, history cleared | Pass |
| 25 | Reset | any | — | statistics, cache diagram, history and buttons all cleared | Pass |
| 26 | Display of checked lines | Set-assoc. | `0, 4, 8, 12` | the searched-but-not-chosen way is labelled “Checked” | Pass |
| 27 | Unsafe input rendering | any | `<img src=x onerror=alert(1)>` | shown as escaped text, never injected | Pass |

**Observed comparison (test cases 6 and 7):** the identical sequence gives 2 hits with FIFO and 1 hit with
LRU, confirming that the replacement policy alone changes the hit ratio — one of the main teaching points of
the project.

---

## 11. Advantages

1. Demonstrates all three mapping techniques and both replacement policies in one tool, with adjustable
   parameters rather than fixed textbook numbers.
2. Every access is explained in words and with its arithmetic, so the student sees the formula being applied.
3. Step-by-step forward *and* backward navigation is exactly consistent, which static diagrams cannot offer.
4. Statistics are derived from the same data as the history table, so the numbers always agree with what is
   displayed.
5. Runs completely offline from a double-click — ideal for laboratory and viva demonstration.
6. No external libraries, so there is nothing to install and no version conflict; the code is short enough to
   read in one sitting.
7. Accessible presentation: HIT/MISS are marked with text as well as colour, controls are keyboard-reachable,
   tables carry captions and the memory cells carry tooltips.
8. Input validation reports the exact reason for rejection instead of failing silently.

## 12. Limitations

1. Block numbers are simulated; byte-level addresses are not split into tag/line/offset bit fields, and word
   offsets inside a block are not shown.
2. Only one cache level — no L1/L2/L3 hierarchy, no inclusion/exclusion policy.
3. Write policies (write-through, write-back, write-allocate) and dirty/clean bits are not modelled.
4. Only FIFO and LRU are implemented; advanced policies (LFU, random, pseudo-LRU, RRIP) are outside scope.
5. Replacement costs are assumed uniform; real hardware may need to write back a dirty block first.
6. Sizes are limited to a few thousand bytes so the whole memory fits on screen; the display additionally
   caps at 128 lines and 512 blocks with a visible note (the logic still uses all of them).
7. Access timing is expressed in abstract clock ticks, not nanoseconds, so no real timing figures are
   produced.
8. Other mapping variants such as asymmetric or skewed associativity are not covered.

---

## 13. Conclusion

The project implements a correct, complete and interactive simulator of cache memory mapping techniques using
only HTML, CSS and JavaScript. Direct, fully associative and set-associative placement are driven by the
standard formulas `line = block mod number_of_lines`, `set = block mod number_of_sets` and
`tag = floor(block / divisor)`, with FIFO and LRU replacement where a choice is genuinely available. The
simulator processes a user-supplied access sequence one step at a time, explains each HIT or MISS, updates the
cache visibly, supports exact backward stepping, and reports total accesses, hits, misses, hit ratio and miss
ratio consistently.

Testing with 89 automated assertions plus the manual cases in section 10 confirms both logical correctness
and interface correctness, including conflict misses, cache thrashing, cache-full behaviour, empty-cache
behaviour, invalid inputs, empty sequences and Previous/Next consistency. The tool therefore turns a static,
formula-heavy topic into an experiment the student can control — which is the objective of the micro project.

---

## 14. Future scope

1. **Byte-level address breakdown:** show the physical address split into tag / set / offset fields, and the
   corresponding bit widths for power-of-two configurations.
2. **Write policies:** write-through vs write-back with dirty bits, and their effect on miss penalty.
3. **Multi-level caches:** L1/L2/L3 with inclusive/exclusive policies and per-level hit rates.
4. **More replacement policies:** LFU, random, pseudo-LRU (tree-based), and an animated comparison of hit ratios.
5. **Miss classification:** compulsory, conflict and capacity misses reported separately, plus a conflict-rate
   metric per line or set.
6. **Average memory access time:** `AMAT = hit time + miss rate x miss penalty` with user-entered times.
7. **Trace file import:** load a real program's memory access trace and replay it on the simulated cache.
8. **Mapping-comparison mode:** run one sequence simultaneously on all three techniques and show a bar chart.
9. **Colour-blind theme and screen-reader improvements**, and exporting the access history as CSV.
10. **Mobile layout refinement** and packaging as a Progressive Web App for offline classroom use.

---

## 15. Viva questions with answers

**Q1. What is cache memory and why is it needed?**
A small, very fast, expensive memory placed between the CPU and main memory. It is needed because of the speed
gap between a fast CPU and slower RAM. It stores copies of recently used or likely-to-be-used memory blocks, so
the CPU is often served by the cache instead of waiting for RAM.

**Q2. What is the difference between a block and a line?**
The size is the same; only the location differs. A **block** is a fixed-size unit of main memory, a **line**
(or frame) is a fixed-size unit of cache. A line holds a copy of a block.

**Q3. What is a tag?**
Extra bits stored with each cache line that identify *which* memory block the line currently holds. Since many
blocks can map to the same line, the tag is what lets the hardware distinguish them and decide HIT or MISS.

**Q4. Give the direct mapping formulas.**
`Cache line = block number mod number of cache lines` and `Tag = floor(block number / number of cache lines)`.

**Q5. Why does direct mapping need no replacement policy?**
Because each block has exactly one possible line. On a miss the line is already occupied by a different block,
so that block must be replaced — the hardware has no choice to make, so no policy is required.

**Q6. What is a conflict miss?**
A miss caused purely by the mapping function: two blocks map to the same line/set, so they evict each other even
though the rest of the cache is empty. Direct mapping suffers most; fully associative suffers none.

**Q7. Explain fully associative mapping and its cost.**
A block may be placed in any free line, and the tag is compared with all lines simultaneously. Advantage: no
conflict misses and the best utilisation. Disadvantage: it needs one comparator per line plus a replacement
algorithm, so it is expensive and slow for large caches.

**Q8. What is set-associative mapping and why is it popular?**
Lines are grouped into sets; a block maps to one set by `set = block mod number_of_sets` but may occupy any way
inside it. It removes most conflict misses at a fraction of the cost of full associativity, so real CPU caches
use it (typically 4-, 8- or 16-way).

**Q9. Define FIFO and LRU. Which is usually better?**
FIFO evicts the block that was loaded earliest. LRU evicts the block that has not been used for the longest
time. LRU usually gives a better hit ratio because it follows the principle of locality, but it must track
usage; FIFO is simpler but can evict a hot block merely because it is old.

**Q10. Two blocks in a 2-line cache hold A and B. A is used constantly, B never. Which policy evicts A?**
FIFO can evict A if A was loaded first, while LRU evicts B because it was used least recently. That difference
is exactly what test cases 6 and 7 of this project demonstrate.

**Q11. What are hit ratio and miss ratio?**
`Hit ratio = hits / total accesses x 100`, `Miss ratio = misses / total accesses x 100`; they always sum to
100% because every access is either a hit or a miss.

**Q12. How is average memory access time computed?**
`AMAT = hit time + miss ratio x miss penalty`. A higher hit ratio lowers the average time.

**Q13. What is the difference between hit time and miss penalty?**
Hit time is the short access time of the cache. Miss penalty is the long extra time taken to fetch the block
from main memory (and possibly write back a dirty block) before the request can be served.

**Q14. How many bits are needed for the line field in an 8-line direct-mapped cache?**
`log2(8) = 3` bits, because the block number's low bits select the line when the counts are powers of two.
In general, `number of sets/lines = 2^field_bits`.

**Q15. Which part of the project is the hardest to get right, and how did you verify it?**
Keeping the cache contents and the statistics exactly consistent when stepping backwards. It was solved by
storing a full snapshot of the cache and counters at each step, so *Previous Step* only re-renders a stored
snapshot; verified by `test-logic.js` (snapshot determinism across 40 random accesses for all three
techniques) and `test-dom.js` (rollback and re-advance give identical results).

**Q16. Why are no external libraries used, and what are the benefits?**
The topic is a few hundred lines of straightforward logic, so plain JavaScript keeps the code readable for an
undergraduate audience. Benefits: no installation, works offline from a double-click, no version or CDN
failures during a demonstration, and no hidden code between the student and the algorithm.

**Q17. How would you extend the simulator for the next COA topic?**
Add write policies (write-through vs write-back with dirty bits) and a two-level cache, then show how the same
mapping rules apply at each level — the step engine already supports it because each level is just another
cache array with its own mapping configuration.

---

## 16. Declaration

I declare that this micro project is my own original work, completed for the Computer Organization &
Architecture (CO5) micro project of the Second Year Computer Science Engineering course, and that the sources
of the concepts used are the standard COA textbooks and lecture notes.

Signature of the student: ................................ Date: ......................
