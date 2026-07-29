# Sfatul Brokerului — Recomandări Dinamice pe Semnale Tehnice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend "Sfatul Brokerului" in the Portfolio tab from a single static sector-concentration message into a capped, severity-sorted list of up to 3 advice cards that also surfaces per-holding RSI-extreme technical signals.

**Architecture:** Extract the existing sector-concentration logic plus new RSI-extreme logic into one pure function, `buildBrokerAdviceCards(enrichedItems, sectorMap, totalValue, stocks)`, in `static/script.js`. It takes plain data (no DOM reads) and returns an array of ready-to-render HTML card strings, already sorted by severity and capped at 3. `renderPortfolio()` calls it and falls back to the existing "well diversified" message when it returns an empty array. No backend changes — `technical.rsi` is already present client-side on each `stocks[i]`.

**Tech Stack:** Vanilla JS (`static/script.js`), Flask static app (bind-mounted, no restart needed for JS/HTML/CSS changes), Playwright-Python test harness at `.claude/skills/run-bvb-trading-dashboard/driver.py`.

## Global Constraints

- No backend/API changes — everything reads from data already available client-side (`stocks[i].technical.rsi`, `enrichedItems`, `sectorMap`, `totalValue`, all already computed inside `renderPortfolio()`).
- RSI-extreme threshold: `rsi < 30` (supravândut) or `rsi > 70` (supracumpărat); `30 <= rsi <= 70` is not extreme (boundaries themselves are NOT extreme — strict `<`/`>`).
- Max 3 cards total. Sector-concentration card (if triggered) always takes the top slot (`severity: Infinity`). RSI cards fill remaining slots sorted by `Math.abs(rsi - 50)` descending, tie-broken by `sharePercent` descending.
- Every RSI card must contain the literal string `Educativ — nu constituie sfat financiar personalizat.` The sector-concentration card keeps its existing copy/behavior verbatim — do not reword it.
- RSI > 70 (overbought) + `item.pl > 0` (position in profit) → suggest partial profit-taking concretely. RSI > 70 + `item.pl <= 0` → warn about correction risk, explicitly do NOT suggest selling at a loss. RSI < 30 (oversold) → suggest concretely evaluating an additional purchase to average down cost.
- If zero cards are produced, keep the exact existing fallback message (`✨ Portofoliu bine diversificat!...`) unchanged.
- If `enrichedItems.length === 0`, behavior is unchanged (advice box stays hidden).
- This codebase has no unit test framework and no `node` binary on the host (verified: `which node` returns nothing). Tests in this plan run as JS one-liners executed in a real browser page via Playwright, through a new `eval` command added to the existing `driver.py` harness (Task 1) — this is the closest equivalent to unit tests available here, and is the TDD mechanism for this plan.
- Follow the project's established static-asset convention: bump the cache-busting query string (`script.js?v=X.Y`) in `static/index.html` whenever `script.js` changes.
- Do not touch the container serving production (`bvb-trading-dashboard`). All verification runs against the isolated `bvb-dashboard-test` container per `.claude/skills/run-bvb-trading-dashboard/SKILL.md`.

---

### Task 1: Add an `eval` command to the Playwright test driver

The existing driver (`.claude/skills/run-bvb-trading-dashboard/driver.py`) can navigate, click, fill, and screenshot, but has no way to run arbitrary JS and inspect a return value. Task 2 needs this to call the new pure function directly with fixture data, without needing real market data or a real portfolio.

**Files:**
- Modify: `.claude/skills/run-bvb-trading-dashboard/driver.py`

**Interfaces:**
- Produces: a new driver command `eval <js-expression>` — evaluates `<js-expression>` in the page context via `page.evaluate()`, prints the returned value (or the exception message on error, without crashing the script). Used by Task 2 and Task 4.

- [ ] **Step 1: Add the `eval` command branch**

In `driver.py`, add a new `elif` branch after the existing `elif cmd == "console":` branch (currently the last `elif` before the `else: unknown command` fallback):

```python
            elif cmd == "eval":
                try:
                    result = page.evaluate(arg)
                    print("  ->", result)
                except Exception as e:
                    print("  !! eval error:", e)
```

Also update the module docstring's command list (near the top of the file) to document it, adding this line after the `console` line:

```
  eval <js-expression>               # runs JS in the page, prints the return value (or error)
```

- [ ] **Step 2: Smoke-test the new command**

Build and start the isolated test container (scratch data dir, so no real portfolio/Telegram config is touched):

```bash
cd /home/pi/bvb-trading-dashboard
docker build -t bvb-dashboard-test:latest .
mkdir -p /tmp/bvb-test-data
echo '{}' > /tmp/bvb-test-data/portfolio.json
echo '[]' > /tmp/bvb-test-data/realized.json
echo '[]' > /tmp/bvb-test-data/alerts.json
echo '{}' > /tmp/bvb-test-data/telegram.json
echo '[]' > /tmp/bvb-test-data/alert_history.json
docker rm -f bvb-dashboard-test 2>/dev/null
docker run -d --name bvb-dashboard-test -p 5051:5050 -v /tmp/bvb-test-data:/app/data bvb-dashboard-test:latest
timeout 20 bash -c 'until curl -sf http://localhost:5051/ >/dev/null; do sleep 1; done'
```

Then run:

```bash
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py <<'EOF'
nav http://localhost:5051/
wait-for text=Dashboard
eval 1 + 1
eval thisFunctionDoesNotExist()
console
EOF
```

Expected: `-> 2` for the first eval, and `!! eval error: ...` (a ReferenceError, not a Python traceback / driver crash) for the second — confirming the harness surfaces both success and failure without aborting the script.

- [ ] **Step 3: Stop the test container**

```bash
docker stop bvb-dashboard-test && docker rm bvb-dashboard-test
```

- [ ] **Step 4: Commit**

```bash
cd /home/pi/bvb-trading-dashboard
git add .claude/skills/run-bvb-trading-dashboard/driver.py
git commit -m "$(cat <<'EOF'
Add eval command to test driver for pure-function JS testing

Needed to exercise the new buildBrokerAdviceCards() logic with
fixture data directly in a real page context, without a node/test
framework (none available on this host) and without needing real
portfolio/market data.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Implement `buildBrokerAdviceCards()` via the eval harness (TDD)

**Files:**
- Modify: `static/script.js` (insert new function immediately before `function renderPortfolio() {` at line 2361)

**Interfaces:**
- Consumes: nothing from other tasks (pure function, no dependencies beyond plain JS).
- Produces: `function buildBrokerAdviceCards(enrichedItems, sectorMap, totalValue, stocks)` → returns `string[]`, each element a ready-to-inject HTML card, length 0-3, sorted by severity descending. Consumed by Task 3.
  - `enrichedItems`: array of `{ symbol: string, pl: number, value: number, ...other fields ignored }`.
  - `sectorMap`: `{ [sectorName: string]: number }` (sector → summed value).
  - `totalValue`: number.
  - `stocks`: array of `{ symbol: string, technical?: { rsi: number, ... } }`.

- [ ] **Step 1: Write the test script (red phase)**

Save this as `/tmp/claude-1000/-home-pi/c2f9e48b-0792-4678-b0ce-563c5a5647aa/scratchpad/broker-advice-tests.txt` (create the scratchpad dir if needed):

```
nav http://localhost:5051/
wait-for text=Dashboard
eval (function(){var items=[{symbol:'AAA',pl:0,value:600}];var sectorMap={'Financiar-Bancar':600};var totalValue=1000;var stocks=[{symbol:'AAA',technical:{rsi:50}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'sector_only',count:cards.length,hasBankText:cards[0].indexOf('Financiar-Bancar')!==-1,hasRsiText:cards[0].indexOf('RSI')!==-1};})()
eval (function(){var items=[{symbol:'BBB',pl:50,value:500}];var sectorMap={};var totalValue=1000;var stocks=[{symbol:'BBB',technical:{rsi:78}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'overbought_profit',count:cards.length,hasProfitTaking:cards[0].indexOf('securizarea parțială')!==-1,hasEdu:cards[0].indexOf('Educativ')!==-1};})()
eval (function(){var items=[{symbol:'CCC',pl:-20,value:500}];var sectorMap={};var totalValue=1000;var stocks=[{symbol:'CCC',technical:{rsi:82}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'overbought_loss',count:cards.length,hasCorrectionWarning:cards[0].indexOf('nu e un motiv tehnic')!==-1};})()
eval (function(){var items=[{symbol:'DDD',pl:-10,value:500}];var sectorMap={};var totalValue=1000;var stocks=[{symbol:'DDD',technical:{rsi:22}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'oversold',count:cards.length,hasAverageDown:cards[0].indexOf('achiziție suplimentară')!==-1};})()
eval (function(){var items=[{symbol:'I',pl:0,value:100},{symbol:'J',pl:0,value:100},{symbol:'K',pl:0,value:100},{symbol:'L',pl:0,value:100},{symbol:'M',pl:0,value:100}];var sectorMap={};var totalValue=1000;var stocks=[{symbol:'I',technical:{rsi:71}},{symbol:'J',technical:{rsi:25}},{symbol:'K',technical:{rsi:10}},{symbol:'L',technical:{rsi:88}},{symbol:'M',technical:{rsi:15}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'cap_and_sort',count:cards.length,order:cards.map(function(c){var m=c.match(/<strong>([A-Z])<\/strong>/);return m?m[1]:'?';})};})()
eval (function(){var items=[{symbol:'N',pl:5,value:400}];var sectorMap={'SectorA':400,'SectorB':400};var totalValue=1000;var stocks=[{symbol:'N',technical:{rsi:50}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'no_signals',count:cards.length};})()
eval (function(){var items=[{symbol:'MISSING',pl:0,value:100}];var sectorMap={};var totalValue=1000;var stocks=[];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'no_matching_stock',count:cards.length};})()
eval (function(){var items=[{symbol:'BOUND',pl:0,value:100}];var sectorMap={};var totalValue=1000;var stocks=[{symbol:'BOUND',technical:{rsi:30}},{symbol:'BOUND2',technical:{rsi:70}}];var cards=buildBrokerAdviceCards(items,sectorMap,totalValue,stocks);return {test:'boundary_not_extreme',count:cards.length};})()
console
```

Expected results once Step 3 is implemented (write them down now so Step 4 has something to check against):
- `sector_only`: `count:1, hasBankText:true, hasRsiText:false`
- `overbought_profit`: `count:1, hasProfitTaking:true, hasEdu:true`
- `overbought_loss`: `count:1, hasCorrectionWarning:true`
- `oversold`: `count:1, hasAverageDown:true`
- `cap_and_sort`: `count:3, order:['K','L','M']` (extremities: I=21, J=25, M=35, L=38, K=40 — top 3 are K, L, M)
- `no_signals`: `count:0`
- `no_matching_stock`: `count:0` (item has no entry in `stocks`, must not throw)
- `boundary_not_extreme`: `count:0` (RSI exactly 30 or 70 is not extreme)

- [ ] **Step 2: Run the test script and confirm it fails**

The test container image bakes in a `COPY . .` snapshot of the repo (see `Dockerfile:10`) — it does NOT bind-mount `static/`, unlike the production container. Build and start it fresh (script.js at this point still lacks `buildBrokerAdviceCards`, which is exactly what this red-phase run checks for):

```bash
cd /home/pi/bvb-trading-dashboard
docker build -t bvb-dashboard-test:latest .
mkdir -p /tmp/bvb-test-data
echo '{}' > /tmp/bvb-test-data/portfolio.json
echo '[]' > /tmp/bvb-test-data/realized.json
echo '[]' > /tmp/bvb-test-data/alerts.json
echo '{}' > /tmp/bvb-test-data/telegram.json
echo '[]' > /tmp/bvb-test-data/alert_history.json
docker rm -f bvb-dashboard-test 2>/dev/null
docker run -d --name bvb-dashboard-test -p 5051:5050 -v /tmp/bvb-test-data:/app/data bvb-dashboard-test:latest
timeout 20 bash -c 'until curl -sf http://localhost:5051/ >/dev/null; do sleep 1; done'
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py < /tmp/claude-1000/-home-pi/c2f9e48b-0792-4678-b0ce-563c5a5647aa/scratchpad/broker-advice-tests.txt
docker stop bvb-dashboard-test && docker rm bvb-dashboard-test
```

Expected: every `eval` line prints `!! eval error: ... buildBrokerAdviceCards is not defined` (ReferenceError) — confirms the function doesn't exist yet. The container is stopped again at the end of this step since Step 3 only edits the file on the host — it doesn't need a running container.

- [ ] **Step 3: Implement `buildBrokerAdviceCards()`**

In `static/script.js`, insert this new function immediately before line 2361 (`function renderPortfolio() {`):

```javascript
// Pure function: takes portfolio/market data, returns up to 3 sorted HTML advice cards.
// Sector-concentration risk always outranks per-holding technical signals (structural vs tactical).
function buildBrokerAdviceCards(enrichedItems, sectorMap, totalValue, stocks) {
    const insights = [];

    // Sector concentration (unchanged logic/copy from the original single-message version).
    let overexposedSector = null;
    let maxPct = 0;

    Object.entries(sectorMap).forEach(([sector, val]) => {
        const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
        if (pct > 50 && pct > maxPct) {
            overexposedSector = sector;
            maxPct = pct;
        }
    });

    if (overexposedSector) {
        let recommendation = "";
        if (overexposedSector === "Financiar-Bancar") {
            recommendation = `Deții o expunere foarte mare în sectorul <strong>Financiar-Bancar</strong> (${maxPct.toFixed(0)}%). Brokerul recomandă diversificarea portofoliului prin adăugarea de acțiuni din <strong>Energie & Utilități</strong> (ex. <strong>Hidroelectrica - H2O</strong> sau <strong>Romgaz - SNG</strong>) pentru o stabilitate mai mare a randamentelor.`;
        } else if (overexposedSector.includes("Energie")) {
            recommendation = `Portofoliul tău este concentrat masiv în sectorul <strong>Energie</strong> (${maxPct.toFixed(0)}%). Pentru a reduce expunerea pe factori macroeconomici de energie, analizează adăugarea unor acțiuni din sectorul <strong>Bancar</strong> (ex. <strong>Banca Transilvania - TLV</strong>) sau <strong>Imobiliar</strong> (ex. <strong>One United - ONE</strong>).`;
        } else {
            recommendation = `Expunerea pe sectorul <strong>${overexposedSector}</strong> depășește 50% din portofoliu (${maxPct.toFixed(0)}%). Pentru o siguranță sporită a capitalului pe termen lung, brokerul îți recomandă să diversifici în alte 1-2 sectoare economice distincte de la BVB.`;
        }

        insights.push({
            severity: Infinity,
            sharePercent: 0,
            html: `
                <div style="color: var(--text-muted); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-blue); padding-left: 10px; margin-top: 10px;">
                    ${recommendation}
                </div>
            `
        });
    }

    // Per-holding RSI-extreme technical signals (educational, not financial advice).
    enrichedItems.forEach(item => {
        const stock = stocks.find(s => s.symbol === item.symbol);
        const rsi = stock && stock.technical ? stock.technical.rsi : null;
        if (rsi === null || rsi === undefined || (rsi >= 30 && rsi <= 70)) return;

        const sharePercent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
        let text = "";

        if (rsi > 70) {
            if (item.pl > 0) {
                text = `<strong>${item.symbol}</strong> (${sharePercent.toFixed(1)}% din portofoliu) are RSI la <strong>${rsi.toFixed(1)}</strong>, în zona tehnică de supracumpărare, iar poziția ta e pe profit. Ia în calcul securizarea parțială a câștigului, pentru a reduce riscul unei corecții tehnice.`;
            } else {
                text = `<strong>${item.symbol}</strong> (${sharePercent.toFixed(1)}% din portofoliu) are RSI la <strong>${rsi.toFixed(1)}</strong>, în zona tehnică de supracumpărare. Semnalează risc de corecție pe termen scurt — poziția ta e deja pe pierdere, deci acest semnal singur nu e un motiv tehnic să vinzi.`;
            }
        } else {
            text = `<strong>${item.symbol}</strong> (${sharePercent.toFixed(1)}% din portofoliu) are RSI la <strong>${rsi.toFixed(1)}</strong>, în zona tehnică de supravânzare. Ai putea evalua o achiziție suplimentară pentru a media prețul de cost, dacă fundamentele companiei rămân neschimbate.`;
        }

        insights.push({
            severity: Math.abs(rsi - 50),
            sharePercent,
            html: `
                <div style="color: var(--text-muted); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-yellow); padding-left: 10px; margin-top: 10px;">
                    ${text}
                    <div style="font-size: 10px; color: var(--text-placeholder); margin-top: 4px; font-style: italic;">Educativ — nu constituie sfat financiar personalizat.</div>
                </div>
            `
        });
    });

    insights.sort((a, b) => {
        if (b.severity !== a.severity) return b.severity - a.severity;
        return b.sharePercent - a.sharePercent;
    });

    return insights.slice(0, 3).map(i => i.html);
}

```

- [ ] **Step 4: Rebuild the test image and confirm the tests now pass**

The image must be rebuilt to pick up the `static/script.js` change from Step 3 (no bind-mount on the test container, see Step 2's note):

```bash
cd /home/pi/bvb-trading-dashboard
docker build -t bvb-dashboard-test:latest .
docker rm -f bvb-dashboard-test 2>/dev/null
docker run -d --name bvb-dashboard-test -p 5051:5050 -v /tmp/bvb-test-data:/app/data bvb-dashboard-test:latest
timeout 20 bash -c 'until curl -sf http://localhost:5051/ >/dev/null; do sleep 1; done'
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py < /tmp/claude-1000/-home-pi/c2f9e48b-0792-4678-b0ce-563c5a5647aa/scratchpad/broker-advice-tests.txt
```

Expected: each `->` line matches the "Expected results" table from Step 1 exactly (booleans `true`, counts, and `order:['K', 'L', 'M']`). If `no_matching_stock` or `boundary_not_extreme` throws instead of returning `count:0`, fix the guard clause (`rsi === null || rsi === undefined || (rsi >= 30 && rsi <= 70)`) before continuing, then rebuild and rerun.

- [ ] **Step 5: Stop the test container**

```bash
docker stop bvb-dashboard-test && docker rm bvb-dashboard-test
```

- [ ] **Step 6: Commit**

```bash
cd /home/pi/bvb-trading-dashboard
git add static/script.js
git commit -m "$(cat <<'EOF'
Add buildBrokerAdviceCards(): RSI-extreme per-holding advice cards

Pure function, verified via the driver's new eval harness with 8
fixture scenarios (sector-only regression, overbought+profit,
overbought+loss, oversold, cap-at-3 with severity sort, no-signal
fallback, missing stock data, and RSI boundary values). Not yet wired
into renderPortfolio() - that's the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `buildBrokerAdviceCards()` into `renderPortfolio()`

**Files:**
- Modify: `static/script.js:2592-2642` (the existing "Generate Broker Diversification Advice" block inside `renderPortfolio()`)
- Modify: `static/index.html:772` (cache-busting version bump)

**Interfaces:**
- Consumes: `buildBrokerAdviceCards(enrichedItems, sectorMap, totalValue, stocks)` from Task 2, called with the same-named local variables already computed earlier in `renderPortfolio()` (`enrichedItems` at line 2392, `sectorMap` at line 2581, `totalValue` accumulated from line 2388, `stocks` the existing module-level global).

- [ ] **Step 1: Replace the inline advice block**

In `static/script.js`, replace this exact block (currently lines 2592-2642):

```javascript
    // Generate Broker Diversification Advice
    const adviceDiv = document.getElementById("portfolio-diversification-advice");
    if (adviceDiv) {
        if (enrichedItems.length === 0) {
            adviceDiv.style.display = "none";
        } else {
            adviceDiv.style.display = "block";
            let adviceHtml = `
                <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <i class="ph-duotone ph-shield-warning"  style="font-size: 16px; width:16px;height:16px;color:var(--color-blue);"></i>
                    Sfatul Brokerului (Diversificare)
                </div>
            `;
            
            let overexposedSector = null;
            let maxPct = 0;
            
            Object.entries(sectorMap).forEach(([sector, val]) => {
                const pct = (val / totalValue) * 100;
                if (pct > 50 && pct > maxPct) {
                    overexposedSector = sector;
                    maxPct = pct;
                }
            });
            
            if (overexposedSector) {
                let recommendation = "";
                if (overexposedSector === "Financiar-Bancar") {
                    recommendation = `Deții o expunere foarte mare în sectorul <strong>Financiar-Bancar</strong> (${maxPct.toFixed(0)}%). Brokerul recomandă diversificarea portofoliului prin adăugarea de acțiuni din <strong>Energie & Utilități</strong> (ex. <strong>Hidroelectrica - H2O</strong> sau <strong>Romgaz - SNG</strong>) pentru o stabilitate mai mare a randamentelor.`;
                } else if (overexposedSector.includes("Energie")) {
                    recommendation = `Portofoliul tău este concentrat masiv în sectorul <strong>Energie</strong> (${maxPct.toFixed(0)}%). Pentru a reduce expunerea pe factori macroeconomici de energie, analizează adăugarea unor acțiuni din sectorul <strong>Bancar</strong> (ex. <strong>Banca Transilvania - TLV</strong>) sau <strong>Imobiliar</strong> (ex. <strong>One United - ONE</strong>).`;
                } else {
                    recommendation = `Expunerea pe sectorul <strong>${overexposedSector}</strong> depășește 50% din portofoliu (${maxPct.toFixed(0)}%). Pentru o siguranță sporită a capitalului pe termen lung, brokerul îți recomandă să diversifici în alte 1-2 sectoare economice distincte de la BVB.`;
                }
                
                adviceHtml += `
                    <div style="color: var(--text-muted); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-blue); padding-left: 10px; margin-top: 6px;">
                        ${recommendation}
                    </div>
                `;
            } else {
                adviceHtml += `
                    <div style="color: var(--text-success); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-emerald); padding-left: 10px; margin-top: 6px;">
                        ✨ <strong>Portofoliu bine diversificat!</strong> Expunerea ta pe sectoare este echilibrată. Felicitări, ai un profil de risc excelent!
                    </div>
                `;
            }
            
            adviceDiv.innerHTML = adviceHtml;
        }
    }
```

with:

```javascript
    // Generate Broker Advice (sector concentration + per-holding RSI-extreme signals)
    const adviceDiv = document.getElementById("portfolio-diversification-advice");
    if (adviceDiv) {
        if (enrichedItems.length === 0) {
            adviceDiv.style.display = "none";
        } else {
            adviceDiv.style.display = "block";
            let adviceHtml = `
                <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <i class="ph-duotone ph-shield-warning"  style="font-size: 16px; width:16px;height:16px;color:var(--color-blue);"></i>
                    Sfatul Brokerului
                </div>
            `;

            const cards = buildBrokerAdviceCards(enrichedItems, sectorMap, totalValue, stocks);

            if (cards.length > 0) {
                adviceHtml += cards.join("");
            } else {
                adviceHtml += `
                    <div style="color: var(--text-success); line-height: 1.4; font-size: 12px; border-left: 3px solid var(--color-emerald); padding-left: 10px; margin-top: 6px;">
                        ✨ <strong>Portofoliu bine diversificat!</strong> Expunerea ta pe sectoare este echilibrată. Felicitări, ai un profil de risc excelent!
                    </div>
                `;
            }

            adviceDiv.innerHTML = adviceHtml;
        }
    }
```

Note: the title drops "(Diversificare)" since the section is no longer only about diversification — this is an intentional, in-scope copy change, not an unrelated edit.

- [ ] **Step 2: Bump the cache-busting version**

In `static/index.html`, change line 772 from:

```html
    <script src="script.js?v=9.12"></script>
```

to:

```html
    <script src="script.js?v=9.13"></script>
```

- [ ] **Step 3: Commit**

```bash
cd /home/pi/bvb-trading-dashboard
git add static/script.js static/index.html
git commit -m "$(cat <<'EOF'
Wire buildBrokerAdviceCards() into renderPortfolio()

Sfatul Brokerului now shows up to 3 severity-sorted cards (sector
concentration + per-holding RSI-extreme signals) instead of a single
static sector-only message. Title drops "(Diversificare)" since the
section covers more than diversification now.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: End-to-end live verification and push

**Files:** none (verification only — no code changes in this task beyond what Tasks 1-3 already committed).

**Interfaces:**
- Consumes: the full running app (isolated test container), `renderPortfolio()` from Task 3, the `eval` driver command from Task 1.

- [ ] **Step 1: Start the isolated test container**

Per `.claude/skills/run-bvb-trading-dashboard/SKILL.md` — rebuild the image first so it picks up the Task 2/3 changes to `static/` (bind-mount only applies to the *production* container, not this freshly-built test image):

```bash
cd /home/pi/bvb-trading-dashboard
docker build -t bvb-dashboard-test:latest .
mkdir -p /tmp/bvb-test-data
echo '{}' > /tmp/bvb-test-data/portfolio.json
echo '[]' > /tmp/bvb-test-data/realized.json
echo '[]' > /tmp/bvb-test-data/alerts.json
echo '{}' > /tmp/bvb-test-data/telegram.json
echo '[]' > /tmp/bvb-test-data/alert_history.json
docker rm -f bvb-dashboard-test 2>/dev/null
docker run -d --name bvb-dashboard-test -p 5051:5050 -v /tmp/bvb-test-data:/app/data bvb-dashboard-test:latest
timeout 20 bash -c 'until curl -sf http://localhost:5051/ >/dev/null; do sleep 1; done'
```

- [ ] **Step 2: Inject a fixture portfolio covering all card types, and render**

```bash
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py <<'EOF'
nav http://localhost:5051/
wait-for text=Dashboard
eval stocks = [{symbol:'TLV',price:10,variation:'+1.00%',technical:{rsi:78}},{symbol:'BRD',price:20,variation:'-1.00%',technical:{rsi:22}},{symbol:'SNG',price:30,variation:'0.00%',technical:{rsi:50}}]; portfolio = [{symbol:'TLV',qty:10,avgPrice:8,dividends:0},{symbol:'BRD',qty:5,avgPrice:25,dividends:0},{symbol:'SNG',qty:5,avgPrice:28,dividends:0}]; renderPortfolio(); 'rendered'
click text=Portofoliu
wait-for sel=#portfolio-diversification-advice
sleep 300
screenshot broker-advice-light
eval document.getElementById('portfolio-diversification-advice').innerText
console
EOF
```

Expected: the last `eval` prints text containing both `TLV` with a profit-taking phrase (10 units bought at 8, price 10 → in profit, RSI 78 → overbought) and `BRD` with an average-down phrase (RSI 22 → oversold); `SNG` (RSI 50) produces no card. No sector-concentration card (`getStockSector` groups these three across different sectors — if it happens to trigger one anyway that's fine, just note which card is in slot 1). `console` must show no errors. Review `screenshots/broker-advice-light.png` to confirm cards render with mono numbers, proper colors, and the "Educativ" tag visible.

- [ ] **Step 3: Verify dark theme**

```bash
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py <<'EOF'
nav http://localhost:5051/
wait-for text=Dashboard
eval stocks = [{symbol:'TLV',price:10,variation:'+1.00%',technical:{rsi:78}},{symbol:'BRD',price:20,variation:'-1.00%',technical:{rsi:22}},{symbol:'SNG',price:30,variation:'0.00%',technical:{rsi:50}}]; portfolio = [{symbol:'TLV',qty:10,avgPrice:8,dividends:0},{symbol:'BRD',qty:5,avgPrice:25,dividends:0},{symbol:'SNG',qty:5,avgPrice:28,dividends:0}]; renderPortfolio(); 'rendered'
click text=Portofoliu
wait-for sel=#portfolio-diversification-advice
click #theme-toggle-btn
sleep 300
screenshot broker-advice-dark
console
EOF
```

Expected: `screenshots/broker-advice-dark.png` shows the same cards legible against the dark background (text/border colors use CSS vars that already flip with `[data-theme="dark"]`, per the existing dark-mode implementation — no new CSS was added, so this should just work). No console errors.

- [ ] **Step 4: Verify the "well diversified" fallback still works**

```bash
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py <<'EOF'
nav http://localhost:5051/
wait-for text=Dashboard
eval stocks = [{symbol:'TLV',price:10,variation:'+1.00%',technical:{rsi:50}}]; portfolio = [{symbol:'TLV',qty:10,avgPrice:8,dividends:0}]; renderPortfolio(); 'rendered'
click text=Portofoliu
wait-for sel=#portfolio-diversification-advice
sleep 300
eval document.getElementById('portfolio-diversification-advice').innerText.indexOf('bine diversificat') !== -1
console
EOF
```

Expected: `-> True`, no console errors.

- [ ] **Step 5: Clean up test artifacts and stop the container**

```bash
docker stop bvb-dashboard-test && docker rm bvb-dashboard-test
rm -f .claude/skills/run-bvb-trading-dashboard/screenshots/broker-advice-*.png
rm -f /tmp/claude-1000/-home-pi/c2f9e48b-0792-4678-b0ce-563c5a5647aa/scratchpad/broker-advice-tests.txt
```

(Screenshots are reviewed in Steps 2-3 above and then deleted per the project's "never leave stray/test screenshots committed" convention — they're already gitignored/untracked scratch output, this just keeps the working tree clean.)

- [ ] **Step 6: Push**

```bash
git push origin master
```

---
