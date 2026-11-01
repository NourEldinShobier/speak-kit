# Running Kokoro-82M and Chatterbox locally from TypeScript

Researched 2026-11-01 (DeepSeek search + page reads).

## Kokoro-82M (default engine, CPU-friendly)

- 82M params, Apache-2.0 weights. Runs on CPU in real time.
- TypeScript path: `kokoro-js` (npm, by the Kokoro/Transformers.js authors) on top of `@huggingface/transformers` + `onnxruntime-node`.
  ```ts
  import { KokoroTTS } from "kokoro-js";
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",   // fp32 | fp16 | q8 | q4 | q4f16
    device: "cpu", // "cpu" in Node, "wasm"/"webgpu" in a browser
  });
  const audio = await tts.generate("Hello", { voice: "af_heart" });   // tts.list_voices()
  ```
- Streaming: `TextSplitterStream` + `tts.stream(splitter)` yields `{ text, phonemes, audio }` per sentence. This is the hook for word/sentence highlighting.
- 28 English voices (American `af_*`/`am_*`, British `bf_*`/`bm_*`), graded A to F. Best: `af_heart`, `af_bella`.
- WebGPU in the browser is flaky (onnxruntime-web issues #23403); prefer `onnxruntime-node` in the Electron main process.

## Chatterbox (premium engine: voice cloning, emotion)

- Resemble AI, MIT. Variants: Turbo (350M), Base (500M, CFG/exaggeration control), Multilingual (500M, 23 languages), Nano (110M, 3x real time on 8 CPU threads).
- Reference implementation is Python/PyTorch (Python 3.11, `pip install chatterbox-tts`). Needs an NVIDIA GPU with 8+ GB VRAM for usable speed (Turbo about 4.5 GB). Zero-shot cloning from 5-10 s of reference audio.
- Two ways to use it from TypeScript:
  1. **Python sidecar** (works today, best quality): Electron main spawns a local FastAPI server (OpenAI-compatible `/v1/audio/speech`, e.g. `travisvn/chatterbox-tts-api`, `Brioch/chatterbox-tts-api`) on 127.0.0.1 and talks to it over HTTP. Needs a bundled or downloaded Python env.
  2. **ONNX in Node/browser** (no Python): `ResembleAI/chatterbox-turbo-ONNX`, `onnx-community/chatterbox-multilingual-ONNX` (Transformers.js v4 supports Chatterbox). Q4 multilingual is 790 MB (speech_encoder 172, embed_tokens 65, language_model 338, conditional_decoder 215). WebGPU needs the int32 variant `spacekaren/chatterbox-turbo-webgpu`. Wrapper example: npm `streamtts`.

## Architecture decision for SpeakKit

- Engine interface `TtsEngine { id, listVoices(), synth(text, opts): AsyncIterable<Chunk> }`.
- `KokoroEngine` runs in an Electron utility process / worker thread via `onnxruntime-node` (never in the renderer).
- `ChatterboxEngine` starts as an optional sidecar (Python env or ONNX), shown as "GPU / Advanced" in the UI with a hardware check and a download manager.
- Chrome extension talks to the desktop app over `http://127.0.0.1:<port>` (loopback only, token header) via a native-messaging-free local HTTP/WebSocket API.

## Closest existing project (study first)

`light-cloud-com/out-loud` (MIT, Electron + React + Vite, Kokoro via onnxruntime-node in a worker thread, espeak-ng, HTTP API on 127.0.0.1:51730 consumed by Chrome/Safari extensions). Streaming endpoint `POST /api/v1/audio/speech/stream {voice,input,speed}` returns `[12-byte header][WAV bytes]` per chunk. SpeakKit differs by adding Chatterbox, PDF reader, a read-along highlighter and an Edge-style floating toolbar.
