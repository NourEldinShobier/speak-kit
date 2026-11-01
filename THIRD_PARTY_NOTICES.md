# Third-party notices

Speak Kit is released under the [MIT licence](LICENSE). It includes and downloads the third-party software, models, fonts and icons below, each under its own licence.

## Models and assets

| Item | Used for | Licence |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (ONNX build `onnx-community/Kokoro-82M-v1.0-ONNX`) | Default voices. Downloaded on first run, not bundled. | Apache-2.0 |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) (Resemble AI) | Optional voice cloning engine, run by a Python sidecar. Downloaded on demand, not bundled. | MIT |
| [Inter](https://rsms.me/inter/) | UI typeface named in the style sheets; used when installed on the system, not bundled. | SIL Open Font License 1.1 |
| [Tabler Icons](https://tabler.io/icons) | Interface icons (`@tabler/icons-react`). | MIT |
| [LAME](https://lame.sourceforge.io/) through `wasm-media-encoders` | MP3 export, compiled to WebAssembly and loaded as a separate module. | LGPL-2.1 (the wrapper is MIT) |
| Lumen design tokens and components | Visual language of the app and extension. | The author's own work, MIT |

Kokoro and Chatterbox model weights are not part of this repository or the installer. Their licences apply to the weights you download; read the model cards before redistributing generated audio.

## npm dependencies

236 packages in the production dependency tree of `code/` (`pnpm licenses list --prod`), grouped by licence. Development tools (Vite+, TypeScript, Playwright and similar) are not shipped and are not listed.

Where a package offers a choice (for example `MIT OR GPL-3.0-or-later`), Speak Kit uses it under the permissive option.

### MIT (171)

| Package | Version | Homepage |
|---|---|---|
| @acemir/cssom | 0.9.32 | <https://github.com/acemir/CSSOM> |
| @floating-ui/core | 1.8.0 | <https://floating-ui.com> |
| @floating-ui/dom | 1.8.0 | <https://floating-ui.com> |
| @floating-ui/react-dom | 2.1.9 | <https://floating-ui.com/docs/react-dom> |
| @floating-ui/utils | 0.2.12 | <https://floating-ui.com> |
| @huggingface/jinja | 0.5.11 | <https://github.com/huggingface/huggingface.js> |
| @img/colour | 1.1.0 | <https://github.com/lovell/colour> |
| @lingo-reader/epub-parser | 0.4.6 | <https://github.com/hhk-png/lingo-reader> |
| @lingo-reader/shared | 0.4.6 | <https://github.com/hhk-png/lingo-reader> |
| @radix-ui/number | 1.1.3 | <https://radix-ui.com/primitives> |
| @radix-ui/primitive | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-accessible-icon | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-accordion | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-alert-dialog | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-arrow | 1.1.17 | <https://radix-ui.com/primitives> |
| @radix-ui/react-aspect-ratio | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-avatar | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-checkbox | 1.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-collapsible | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-collection | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-compose-refs | 1.1.5 | <https://radix-ui.com/primitives> |
| @radix-ui/react-context | 1.3.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-context-menu | 2.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-dialog | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-direction | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-dismissable-layer | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-dropdown-menu | 2.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-focus-guards | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-focus-scope | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-form | 0.3.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-hover-card | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-id | 1.1.4 | <https://radix-ui.com/primitives> |
| @radix-ui/react-label | 2.1.17 | <https://radix-ui.com/primitives> |
| @radix-ui/react-menu | 2.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-menubar | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-navigation-menu | 1.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-one-time-password-field | 0.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-password-toggle-field | 0.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-popover | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-popper | 1.4.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-portal | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-presence | 1.1.11 | <https://radix-ui.com/primitives> |
| @radix-ui/react-primitive | 2.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-progress | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-radio-group | 1.5.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-roving-focus | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-scroll-area | 1.4.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-select | 2.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-separator | 1.2.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-slider | 1.6.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-slot | 1.5.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-switch | 1.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-tabs | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-toast | 1.3.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-toggle | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-toggle-group | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-toolbar | 1.2.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-tooltip | 1.4.1 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-callback-ref | 1.1.5 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-controllable-state | 1.3.0 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-effect-event | 0.0.5 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-escape-keydown | 1.1.6 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-is-hydrated | 0.1.3 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-layout-effect | 1.1.4 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-previous | 1.1.4 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-rect | 1.1.4 | <https://radix-ui.com/primitives> |
| @radix-ui/react-use-size | 1.1.5 | <https://radix-ui.com/primitives> |
| @radix-ui/react-visually-hidden | 1.2.13 | <https://radix-ui.com/primitives> |
| @radix-ui/rect | 1.1.3 | <https://radix-ui.com/primitives> |
| @types/node | 26.6.6 | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node> |
| @xmldom/xmldom | 0.8.15 | <https://github.com/xmldom/xmldom> |
| ajv | 8.20.0 | <https://ajv.js.org> |
| ajv-formats | 3.0.1 | <https://github.com/ajv-validator/ajv-formats> |
| argparse | 1.0.10 | <https://github.com/nodeca/argparse> |
| aria-hidden | 1.2.6 | <https://github.com/theKashey/aria-hidden> |
| atomically | 2.1.1 | <https://github.com/fabiospampinato/atomically> |
| base64-js | 1.5.1 | <https://github.com/beatgammit/base64-js> |
| bmp-js | 0.1.0 | <https://github.com/shaozilee/bmp-js> |
| boolean | 3.2.0 | <https://github.com/thenativeweb/boolean> |
| builder-util-runtime | 9.7.0 | <https://github.com/electron-userland/electron-builder> |
| conf | 16.0.0 | <https://github.com/sindresorhus/conf> |
| core-util-is | 1.0.3 | <https://github.com/isaacs/core-util-is> |
| debounce-fn | 6.0.0 | <https://github.com/sindresorhus/debounce-fn> |
| debug | 4.4.3 | <https://github.com/debug-js/debug> |
| define-data-property | 1.1.4 | <https://github.com/ljharb/define-data-property> |
| define-properties | 1.2.1 | <https://github.com/ljharb/define-properties> |
| detect-node | 2.1.0 | <https://github.com/iliakan/detect-node> |
| detect-node-es | 1.1.0 | <https://github.com/thekashey/detect-node> |
| dom-serializer | 2.0.0, 3.1.1 | <https://github.com/cheeriojs/dom-serializer> |
| dot-prop | 10.2.0 | <https://github.com/sindresorhus/dot-prop> |
| electron-log | 5.4.4 | <https://github.com/megahertz/electron-log> |
| electron-store | 12.0.0 | <https://github.com/sindresorhus/electron-store> |
| electron-updater | 6.8.11 | <https://github.com/electron-userland/electron-builder> |
| env-paths | 4.0.0 | <https://github.com/sindresorhus/env-paths> |
| es-define-property | 1.0.1 | <https://github.com/ljharb/es-define-property> |
| es-errors | 1.3.0 | <https://github.com/ljharb/es-errors> |
| es6-error | 4.1.1 | <https://github.com/bjyoungblood/es6-error> |
| escape-string-regexp | 4.0.0 | <https://github.com/sindresorhus/escape-string-regexp> |
| events | 3.3.0 | <https://github.com/Gozala/events> |
| fast-deep-equal | 3.1.3 | <https://github.com/epoberezkin/fast-deep-equal> |
| fflate | 0.8.3 | <https://101arrowz.github.io/fflate> |
| fs-extra | 10.1.0 | <https://github.com/jprichardson/node-fs-extra> |
| get-nonce | 1.0.1 | <https://github.com/theKashey/get-nonce> |
| globalthis | 1.0.4 | <https://github.com/ljharb/System.global> |
| gopd | 1.2.0 | <https://github.com/ljharb/gopd> |
| has-property-descriptors | 1.0.2 | <https://github.com/inspect-js/has-property-descriptors> |
| html-escaper | 3.0.3 | <https://github.com/WebReflection/html-escaper> |
| htmlparser2 | 10.1.0 | <https://github.com/fb55/htmlparser2> |
| immediate | 3.0.6 | <https://github.com/calvinmetcalf/immediate> |
| is-safe-filename | 0.1.1 | <https://github.com/sindresorhus/is-safe-filename> |
| is-url | 1.2.4 | <https://github.com/segmentio/is-url> |
| isarray | 1.0.0 | <https://github.com/juliangruber/isarray> |
| js-yaml | 4.3.2 | <https://github.com/nodeca/js-yaml> |
| json-schema-traverse | 1.0.0 | <https://github.com/epoberezkin/json-schema-traverse> |
| jsonfile | 6.2.1 | <https://github.com/jprichardson/node-jsonfile> |
| koffi | 3.3.6 | <https://koffi.dev/> |
| lazy-val | 1.0.5 | <https://github.com/develar/lazy-val> |
| lie | 3.3.0 | <https://github.com/calvinmetcalf/lie> |
| lodash.escaperegexp | 4.1.2 | <https://lodash.com/> |
| lodash.isequal | 4.5.0 | <https://lodash.com/> |
| lowdb | 7.0.1 | <https://github.com/typicode/lowdb> |
| marked | 18.1.2 | <https://marked.js.org> |
| matcher | 3.0.0 | <https://github.com/sindresorhus/matcher> |
| mimic-function | 5.0.1 | <https://github.com/sindresorhus/mimic-function> |
| minizlib | 3.1.0 | <https://github.com/isaacs/minizlib> |
| ms | 2.1.3 | <https://github.com/vercel/ms> |
| node-fetch | 2.7.0 | <https://github.com/bitinn/node-fetch> |
| number-to-words | 1.2.5 | <https://github.com/marlun78/number-to-words> |
| object-keys | 1.1.1 | <https://github.com/ljharb/object-keys> |
| onnxruntime-common | 1.21.0, 1.22.0-dev.20250409-89f8206ba4 | <https://github.com/Microsoft/onnxruntime> |
| onnxruntime-node | 1.21.0 | <https://github.com/Microsoft/onnxruntime> |
| onnxruntime-web | 1.22.0-dev.20250409-89f8206ba4 | <https://github.com/Microsoft/onnxruntime> |
| opencollective-postinstall | 2.0.3 | <https://github.com/opencollective/opencollective-postinstall> |
| path-browserify | 1.0.1 | <https://github.com/browserify/path-browserify> |
| platform | 1.3.6 | <https://github.com/bestiejs/platform.js> |
| process-nextick-args | 2.0.1 | <https://github.com/calvinmetcalf/process-nextick-args> |
| radix-ui | 1.8.1 | <https://radix-ui.com/primitives> |
| react | 19.3.1 | <https://react.dev/> |
| react-dom | 19.3.1 | <https://react.dev/> |
| react-remove-scroll | 2.7.2 | <https://github.com/theKashey/react-remove-scroll> |
| react-remove-scroll-bar | 2.3.8 | <https://github.com/theKashey/react-remove-scroll-bar> |
| react-style-singleton | 2.2.3 | <https://github.com/theKashey/react-style-singleton> |
| readable-stream | 2.3.8 | <https://github.com/nodejs/readable-stream> |
| regenerator-runtime | 0.13.11 | <https://github.com/facebook/regenerator/tree/main> |
| require-from-string | 2.0.2 | <https://github.com/floatdrop/require-from-string> |
| safe-buffer | 5.1.2 | <https://github.com/feross/safe-buffer> |
| scheduler | 0.28.0 | <https://react.dev/> |
| semver-compare | 1.0.0 | <https://github.com/substack/semver-compare> |
| serialize-error | 7.0.1 | <https://github.com/sindresorhus/serialize-error> |
| setimmediate | 1.0.5 | <https://github.com/YuzuJS/setImmediate> |
| steno | 4.0.2 | <https://github.com/typicode/steno> |
| string_decoder | 1.1.1 | <https://github.com/nodejs/string_decoder> |
| stubborn-fs | 2.0.0 | <https://github.com/fabiospampinato/stubborn-fs> |
| stubborn-utils | 1.0.2 | <https://github.com/fabiospampinato/stubborn-utils> |
| tagged-tag | 1.0.0 | <https://github.com/sindresorhus/tagged-tag> |
| tiny-typed-emitter | 2.1.0 | <https://github.com/binier/tiny-typed-emitter> |
| tr46 | 0.0.3 | <https://github.com/Sebmaster/tr46.js> |
| uint8array-extras | 1.6.0 | <https://github.com/sindresorhus/uint8array-extras> |
| underscore | 1.13.8 | <https://underscorejs.org> |
| undici | 7.30.1 | <https://undici.nodejs.org> |
| undici-types | 8.9.0 | <https://undici.nodejs.org> |
| universalify | 2.0.1 | <https://github.com/RyanZim/universalify> |
| use-callback-ref | 1.3.3 |  |
| use-sidecar | 1.1.3 | <https://github.com/theKashey/use-sidecar> |
| util-deprecate | 1.0.2 | <https://github.com/TooTallNate/util-deprecate> |
| valibot | 1.5.0 | <https://valibot.dev> |
| wasm-media-encoders | 0.7.0 | <https://github.com/arseneyr/wasm-media-encoders> |
| whatwg-url | 5.0.0 | <https://github.com/jsdom/whatwg-url> |
| when-exit | 2.1.5 | <https://github.com/fabiospampinato/when-exit> |
| xmlbuilder | 10.1.1 | <http://github.com/oozcitak/xmlbuilder-js> |
| zlibjs | 0.3.1 | <https://github.com/imaya/zlib.js> |

### (MIT OR CC0-1.0) (1)

| Package | Version | Homepage |
|---|---|---|
| type-fest | 0.13.1, 5.10.0 | <https://github.com/sindresorhus/type-fest> |

### (MIT AND Zlib) (1)

| Package | Version | Homepage |
|---|---|---|
| pako | 1.0.11 | <https://github.com/nodeca/pako> |

### (MIT OR GPL-3.0-or-later) (1)

| Package | Version | Homepage |
|---|---|---|
| jszip | 3.10.2 | <https://github.com/Stuk/jszip> |

### Apache-2.0 (14)

| Package | Version | Homepage |
|---|---|---|
| @huggingface/transformers | 3.8.1 | <https://github.com/huggingface/transformers.js> |
| @mozilla/readability | 0.6.0 | <https://github.com/mozilla/readability> |
| @swc/helpers | 0.5.23 | <https://swc.rs> |
| detect-libc | 2.1.2 | <https://github.com/lovell/detect-libc> |
| flatbuffers | 25.9.23 | <https://google.github.io/flatbuffers/> |
| idb-keyval | 6.3.0 | <https://github.com/jakearchibald/idb-keyval> |
| kokoro-js | 1.2.1 | <https://github.com/hexgrad/kokoro> |
| long | 5.3.2 | <https://github.com/dcodeIO/long.js> |
| pdfjs-dist | 6.4.299 | <https://mozilla.github.io/pdf.js/> |
| phonemizer | 1.2.1 | <https://github.com/xenova/phonemizer.js> |
| sharp | 0.34.5 | <https://sharp.pixelplumbing.com> |
| tesseract.js | 7.0.0 | <https://github.com/naptha/tesseract.js> |
| tesseract.js-core | 7.0.0 | <https://github.com/naptha/tesseract.js-core> |
| wasm-feature-detect | 1.9.0 | <https://github.com/GoogleChromeLabs/wasm-feature-detect> |

### BSD-3-Clause (14)

| Package | Version | Homepage |
|---|---|---|
| @protobufjs/aspromise | 1.1.2 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/base64 | 1.1.2 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/codegen | 2.0.5 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/eventemitter | 1.1.1 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/fetch | 1.1.1 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/float | 1.0.2 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/path | 1.1.2 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/pool | 1.1.0 | <https://github.com/dcodeIO/protobuf.js> |
| @protobufjs/utf8 | 1.1.2 | <https://github.com/protobufjs/protobuf.js> |
| fast-uri | 3.1.9 | <https://github.com/fastify/fast-uri> |
| global-agent | 3.0.0 | <https://github.com/gajus/global-agent> |
| protobufjs | 7.6.6 | <https://protobufjs.github.io/protobuf.js/> |
| roarr | 2.15.4 | <https://github.com/gajus/roarr> |
| sprintf-js | 1.0.3, 1.1.3 | <https://github.com/alexei/sprintf.js> |

### BSD-2-Clause (13)

| Package | Version | Homepage |
|---|---|---|
| css-select | 7.0.0 | <https://github.com/fb55/css-select> |
| css-what | 8.0.0 | <https://github.com/fb55/css-what> |
| dingbat-to-unicode | 1.0.2 | <https://github.com/mwilliamson/dingbat-to-unicode> |
| domelementtype | 2.3.0, 3.0.0 | <https://github.com/fb55/domelementtype> |
| domhandler | 5.0.3, 6.0.1 | <https://github.com/fb55/domhandler> |
| domutils | 3.2.2, 4.0.2 | <https://github.com/fb55/domutils> |
| entities | 4.5.0, 7.0.1, 8.1.0 | <https://github.com/fb55/entities> |
| json-schema-typed | 8.0.2 | <https://github.com/RemyRylan/json-schema-typed/tree/main/dist/node> |
| lop | 0.4.2 | <https://github.com/mwilliamson/lop> |
| mammoth | 1.13.0 | <https://github.com/mwilliamson/mammoth.js> |
| nth-check | 3.0.1 | <https://github.com/fb55/nth-check> |
| option | 0.2.4 | <https://github.com/mwilliamson/node-options> |
| webidl-conversions | 3.0.1 | <https://github.com/jsdom/webidl-conversions> |

### BlueOak-1.0.0 (5)

| Package | Version | Homepage |
|---|---|---|
| chownr | 3.0.0 | <https://github.com/isaacs/chownr> |
| minipass | 7.1.3 | <https://github.com/isaacs/minipass> |
| sax | 1.6.1 | <https://github.com/isaacs/sax-js> |
| tar | 7.5.22 | <https://github.com/isaacs/node-tar> |
| yallist | 5.0.0 | <https://github.com/isaacs/yallist> |

### Python-2.0 (1)

| Package | Version | Homepage |
|---|---|---|
| argparse | 2.0.1 | <https://github.com/nodeca/argparse> |

### ISC (9)

| Package | Version | Homepage |
|---|---|---|
| @isaacs/fs-minipass | 4.0.1 | <https://github.com/npm/fs-minipass> |
| boolbase | 2.0.0 | <https://github.com/fb55/boolbase> |
| graceful-fs | 4.2.11 | <https://github.com/isaacs/node-graceful-fs> |
| guid-typescript | 1.0.9 | <https://github.com/NicolasDeveloper/guid-typescript> |
| inherits | 2.0.4 | <https://github.com/isaacs/inherits> |
| json-stringify-safe | 5.0.1 | <https://github.com/isaacs/json-stringify-safe> |
| linkedom | 0.18.14 | <https://github.com/WebReflection/linkedom> |
| semver | 7.7.4, 7.8.5 | <https://github.com/npm/node-semver> |
| uhyphen | 0.2.0 | <https://github.com/WebReflection/uhyphen> |

### 0BSD (1)

| Package | Version | Homepage |
|---|---|---|
| tslib | 2.9.1 | <https://www.typescriptlang.org/> |

### MPL-2.0 (4)

| Package | Version | Homepage |
|---|---|---|
| @soundtouchjs/audio-worklet | 2.1.1 | <https://github.com/cutterbl/SoundTouchJS> |
| @soundtouchjs/core | 2.1.1 | <https://github.com/cutterbl/SoundTouchJS> |
| @soundtouchjs/interpolation-strategy-lanczos | 2.1.1 | <https://github.com/cutterbl/SoundTouchJS> |
| @soundtouchjs/worklet-base | 2.1.1 | <https://github.com/cutterbl/SoundTouchJS> |

### BSD (1)

| Package | Version | Homepage |
|---|---|---|
| duck | 0.1.12 | <https://github.com/mwilliamson/duck.js> |

Regenerate this file with `node tools/third-party-notices.mjs`.
