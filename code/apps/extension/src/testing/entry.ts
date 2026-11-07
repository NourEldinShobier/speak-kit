// Test-only entry: the production content script plus its pure modules exposed on `window.SK`.
import * as extract from "../features/reader/extract";
import * as hl from "../features/highlight/highlight";
import "../app/content/index";

(window as unknown as { SK: unknown }).SK = { extract, hl };
