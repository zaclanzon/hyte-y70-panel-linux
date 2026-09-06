# Ambient browser regression check

With an isolated panel server running, install Playwright in a temporary directory
and run `ambient.cjs`. The check mocks the Save response; it never writes configuration
or drives hardware.

```sh
npm install --prefix /tmp/hyte-browser-deps playwright
/tmp/hyte-browser-deps/node_modules/.bin/playwright install chromium
HYTE_PLAYWRIGHT_MODULE=/tmp/hyte-browser-deps/node_modules/playwright \
HYTE_TEST_URL=http://127.0.0.1:8137 node tests/browser/ambient.cjs
```

`HYTE_CHROMIUM` optionally selects an existing Chromium executable, and
`HYTE_SCREENSHOT` saves a gallery screenshot. The browser uses software WebGL
for repeatable shader verification, not hardware performance measurements.

The check scrolls through every design, checks for shader failures, verifies the
three new themes change frames without hover, and checks the shared context,
frame and pixel budgets, offscreen pause, hidden-tab resume, reduced motion,
and preview preservation after saving settings.

## Panel CPU regressions

`panel.cjs` serves its own fixed data and local assets through Playwright routing;
no server, live hardware, or configuration file is needed:

```sh
HYTE_PLAYWRIGHT_MODULE=/tmp/hyte-browser-deps/node_modules/playwright \
node tests/browser/panel.cjs
```

It verifies that repeated snapshots preserve unchanged widget nodes, paused and
hidden automata perform no engine work, edits still render while paused, and
visibility/suspension preserve the user's play/pause choice. `HYTE_CHROMIUM`
selects a browser executable; `HYTE_SCREENSHOT` selects the screenshot path.
The WebKit test in `automata/test/gpu.html` also checks asynchronous readback
against an exact snapshot while simulation advances, and resize cancellation.
