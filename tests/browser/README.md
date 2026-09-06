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
