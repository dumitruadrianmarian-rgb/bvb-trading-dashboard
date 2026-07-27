---
name: run-bvb-trading-dashboard
description: Build, run, and drive the BVB Trading Dashboard (Flask web app for BVB stock tracking). Use when asked to start bvb-trading-dashboard, test a change to app.py or the frontend, or take a screenshot of the dashboard/watchlist UI.
---

Flask app (`app.py`) serving a static JS/HTML frontend on port 5050 inside
the container. Drive it with `driver.py` in this directory — a Playwright
(Python) REPL-style script, since this host has no node/npm/`chromium-cli`.

All paths below are relative to `bvb-trading-dashboard/` (the repo root).

**A production instance of this exact app is already running** as the
`bvb-trading-dashboard` container (real portfolio, real Telegram bot
token in `data/telegram.json`). Never `docker compose up` / rebuild that
container to "test" a change — it restarts live, wipes in-memory scrape
caches, and a misconfigured test could fire real Telegram alerts. Always
build and run an **isolated, separately-named** container against a
scratch data directory, as below.

## Prerequisites

Docker is already installed on this host. For the driver:

```bash
python3 -m venv /tmp/pw-venv
/tmp/pw-venv/bin/pip install -q playwright
/tmp/pw-venv/bin/playwright install chromium   # instant — browser is already cached in ~/.cache/ms-playwright
```

## Build (isolated image)

```bash
docker build -t bvb-dashboard-test:latest .
```

## Run (agent path)

Run under a different container name/port than production, with a
scratch data directory (empty portfolio, empty telegram config so no
real alerts fire):

```bash
mkdir -p /tmp/bvb-test-data
echo '{}' > /tmp/bvb-test-data/portfolio.json
echo '[]' > /tmp/bvb-test-data/realized.json
echo '[]' > /tmp/bvb-test-data/alerts.json
echo '{}' > /tmp/bvb-test-data/telegram.json
echo '[]' > /tmp/bvb-test-data/alert_history.json

docker rm -f bvb-dashboard-test 2>/dev/null
docker run -d --name bvb-dashboard-test -p 5051:5050 \
  -v /tmp/bvb-test-data:/app/data \
  bvb-dashboard-test:latest

timeout 20 bash -c 'until curl -sf http://localhost:5051/ >/dev/null; do sleep 1; done'
```

Drive it with `driver.py` (a small chromium-cli-style REPL — see the
docstring at the top of the file for the full command list):

```bash
/tmp/pw-venv/bin/python3 .claude/skills/run-bvb-trading-dashboard/driver.py <<'EOF'
nav http://localhost:5051/
wait-for text=Dashboard
screenshot dashboard
click text=Watchlist
wait-for sel=input[placeholder*='Caut']
fill input[placeholder*='Caut'] TLV
sleep 800
screenshot watchlist-search
console
EOF
```

Screenshots land in `.claude/skills/run-bvb-trading-dashboard/screenshots/`.
Exit code is 1 if any console error was captured — check the printed
`[console-errors]` line (see Gotchas: one specific error string is expected
and harmless in this sandbox).

Stop when done — this does **not** touch the production container:

```bash
docker stop bvb-dashboard-test && docker rm bvb-dashboard-test
```

### Driver commands

| command | what it does |
|---|---|
| `nav <url>` | navigate |
| `wait-for text=<substr>` / `wait-for sel=<css>` | wait for an element |
| `click <css selector>` | click |
| `fill <css selector> <value>` | fill an input |
| `press <key>` | keyboard press, e.g. `Enter` |
| `screenshot <name>` | full-page screenshot → `screenshots/<name>.png` |
| `sleep <ms>` | fixed wait |
| `console` | print console errors captured so far |

## Run (human path)

Production deploy (already running — do not re-run casually):

```bash
docker compose up -d --build
```

Serves on port 5050 inside the `proxy` Docker network, routed by Traefik
at `trade.home.srv` (LAN) / the configured public host. `data/`, `static/`,
and `app.py` are bind-mounted, so editing them live-updates the running
container without a rebuild — useful for the human path, dangerous for
"let me just test this" (it's editing production).

## Test

No automated test suite in this repo.

## Gotchas

- **App requires Docker to run at all.** `app.py` mixes a relative data
  path (`PORTFOLIO_FILE = 'data/portfolio.json'`) with an absolute one
  (`DATA_DIR = "/app/data"`, used for alerts/telegram — see app.py:1224).
  Running `python app.py` directly on the host (outside a container)
  makes it try to `os.makedirs("/app/data")` on the real host filesystem,
  which fails with a permission error. Always run it via the Docker image.
- **`ERR_NETWORK_CHANGED` console errors are expected and harmless** —
  they come from the background auto-refresh polling BVB/Yahoo Finance
  from inside this sandboxed container's network, not from an app bug.
  Don't treat that specific error as a real regression.
- **The watchlist search dropdown is populated live** from a scrape of
  bvb.ro — it needs outbound internet access from wherever the container
  runs. If it comes back empty, check the container's network access
  before assuming the frontend is broken.
- **Never point a test run at the real `data/` directory** — `telegram.json`
  there has a live bot token; a triggered alert would send a real message.
  Always use a scratch data dir as shown above.
