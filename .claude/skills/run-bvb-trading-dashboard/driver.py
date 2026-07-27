#!/usr/bin/env python3
"""
Minimal chromium-cli-style REPL driver, backed by Playwright (Python).

Use this instead of chromium-cli: this host has no node/npm, but does have
a Playwright Python venv with Chromium already downloaded (see SKILL.md for
the exact venv path). Feed it a script over stdin, one command per line:

  nav <url>
  wait-for text=<substring>          # waits for element containing text
  wait-for sel=<css selector>        # waits for element matching selector
  click <css selector>
  fill <css selector> <value>
  press <key>                        # e.g. Enter
  screenshot <name>                  # saves screenshots/<name>.png
  console                            # prints captured console errors so far
  sleep <ms>

Blank lines and lines starting with # are ignored. Exits non-zero if any
console error was captured by the end of the script (check the printed
[console-errors] block).

Example:
  driver_python -m ...  (see SKILL.md for the exact interpreter invocation)
  echo 'nav http://localhost:5051/
  wait-for text=Dashboard
  screenshot dashboard' | <pwenv-python> driver.py
"""
import sys
import os

from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SHOT_DIR = os.path.join(SCRIPT_DIR, "screenshots")
os.makedirs(SHOT_DIR, exist_ok=True)


def main():
    lines = [l.rstrip("\n") for l in sys.stdin if l.strip() and not l.strip().startswith("#")]
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        for raw in lines:
            parts = raw.split(maxsplit=1)
            cmd = parts[0]
            arg = parts[1] if len(parts) > 1 else ""
            print(f"> {raw}")

            if cmd == "nav":
                page.goto(arg, wait_until="load")
            elif cmd == "wait-for":
                if arg.startswith("text="):
                    page.wait_for_selector(f"text={arg[5:]}", timeout=15000)
                elif arg.startswith("sel="):
                    page.wait_for_selector(arg[4:], timeout=15000)
                else:
                    page.wait_for_selector(arg, timeout=15000)
            elif cmd == "click":
                page.click(arg, timeout=15000)
            elif cmd == "fill":
                sel, value = arg.split(maxsplit=1)
                page.fill(sel, value, timeout=15000)
            elif cmd == "upload":
                sel, paths = arg.split(maxsplit=1)
                page.set_input_files(sel, paths.split(","), timeout=15000)
            elif cmd == "press":
                page.keyboard.press(arg)
            elif cmd == "screenshot":
                name = arg or "screenshot"
                path = os.path.join(SHOT_DIR, f"{name}.png")
                page.screenshot(path=path, full_page=True)
                print(f"  saved {path}")
            elif cmd == "sleep":
                page.wait_for_timeout(int(arg))
            elif cmd == "console":
                print("  errors so far:", console_errors)
            else:
                print(f"  unknown command: {cmd}", file=sys.stderr)

        print("[console-errors]", console_errors)
        browser.close()
        return 1 if console_errors else 0


if __name__ == "__main__":
    sys.exit(main())
