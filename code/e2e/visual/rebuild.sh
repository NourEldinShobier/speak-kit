#!/bin/sh
# rebuild the test build of the extension into dist-visual (does not touch dist/ used by the e2e tests)
cd "$(dirname "$0")/../../apps/extension" && SPEAKKIT_TEST=1 pnpm exec vp build --outDir dist-visual 2>&1 | tail -n 3
