"""Chatterbox sidecar for SpeakKit. Line-delimited JSON on stdin/stdout; stderr is for logs.

In:  {"op": "synth", "id": 1, "text": "...", "reference": "<wav path>" | null}
     {"op": "abort", "id": 1}   stops that request (queued or running); no reply is sent for it
Out: {"kind": "progress", "phase": "downloading" | "loading", "progress": 0..1}
     {"kind": "ready"}
     {"kind": "audio", "id": 1, "sampleRate": 24000, "pcm": "<base64 int16 little-endian>"}
     {"kind": "error", "id": 1, "message": "...", "code": "out-of-memory"}  /  {"kind": "fatal", "message": "...", "code": "disk-full"}
     "code" is optional: "out-of-memory" (CUDA) or "disk-full" (ENOSPC), so the host can tell the person what to do.

Exits when stdin closes. The automated tests use tests/fake-sidecar.mjs; run the real one with SPEAKKIT_REAL_CHATTERBOX=1.
"""

import base64
import errno
import json
import os
import queue
import sys
import threading
import warnings

# The only files ChatterboxTTS reads; the repository also holds ~9 GB of multilingual and legacy weights.
WEIGHTS = ["ve.safetensors", "t3_cfg.safetensors", "s3gen.safetensors", "tokenizer.json", "conds.pt"]


class Aborted(Exception):
    pass


def cause(e):
    code = failure_code(e)
    return {"code": code} if code else {}


def failure_code(e):
    """The actionable cause of an exception, or None."""
    if type(e).__name__ == "OutOfMemoryError" or "CUDA out of memory" in str(e):
        return "out-of-memory"
    if isinstance(e, OSError) and e.errno == errno.ENOSPC:
        return "disk-full"
    return None


def main():
    # Keep library output off the protocol channel.
    out = sys.stdout
    sys.stdout = sys.stderr
    warnings.filterwarnings("ignore")

    lock = threading.Lock()  # the download heartbeat and the main loop both write

    def send(obj):
        with lock:
            out.write(json.dumps(obj) + "\n")
            out.flush()

    # hf-xet (the default downloader of huggingface_hub 1.x) reports no byte progress for minutes; plain HTTP does, through tqdm.
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    try:
        import numpy as np
        import torch
        from huggingface_hub import snapshot_download
        from tqdm import tqdm

        class Progress(tqdm):
            def update(self, n=1):
                super().update(n)
                if self.total and self.unit == "B":  # the byte bar; the "Fetching N files" bar would jump around
                    last[0] = min(1.0, self.n / self.total)
                    send({"kind": "progress", "phase": "downloading", "progress": last[0]})

        last = [0.0]
        done = threading.Event()

        def beat():  # the host kills a sidecar that stays silent; a stalled-looking download must still say it is alive
            while not done.wait(5):
                send({"kind": "progress", "phase": "downloading", "progress": last[0]})

        threading.Thread(target=beat, daemon=True).start()
        send({"kind": "progress", "phase": "downloading", "progress": 0.0})
        try:
            path = snapshot_download("ResembleAI/chatterbox", allow_patterns=WEIGHTS, tqdm_class=Progress)
        finally:
            done.set()
        send({"kind": "progress", "phase": "loading"})
        import chatterbox.models.t3.t3 as t3
        from chatterbox.tts import ChatterboxTTS

        model = ChatterboxTTS.from_local(path, "cuda" if torch.cuda.is_available() else "cpu")
        sr = int(model.sr)
        model.generate("Hello.")  # first call compiles CUDA kernels (about 20 s); pay it before "ready", not on the first sentence
        send({"kind": "ready"})
    except Exception as e:  # noqa: BLE001
        send({"kind": "fatal", "message": f"{type(e).__name__}: {e}", **cause(e)})
        return 1

    jobs = queue.Queue()
    aborted = set()
    current = [0]

    def read_requests():
        for line in sys.stdin:
            try:
                req = json.loads(line)
            except ValueError:
                continue
            if req.get("op") == "abort":
                aborted.add(req.get("id"))
            elif req.get("op") == "synth":
                jobs.put(req)
        jobs.put(None)

    threading.Thread(target=read_requests, daemon=True).start()

    def checked(iterable, **_):
        # Replaces tqdm inside the token loop: one check per sampled token, no stderr progress bar.
        for item in iterable:
            if current[0] in aborted:
                raise Aborted()
            yield item

    t3.tqdm = checked

    builtin = model.conds
    prepared = [None, None]  # [reference path, conditionals]; a clip is analysed once, not per sentence

    def conditionals(reference):
        if not reference:
            return builtin
        if prepared[0] != reference:
            model.prepare_conditionals(reference)
            prepared[:] = [reference, model.conds]
        return prepared[1]

    while (req := jobs.get()) is not None:
        current[0] = req["id"]
        try:
            if req["id"] in aborted:
                continue
            model.conds = conditionals(req.get("reference"))
            wav = model.generate(req["text"])
            pcm = (wav.squeeze().cpu().numpy().clip(-1, 1) * 32767).astype(np.int16)
            send({"kind": "audio", "id": req["id"], "sampleRate": sr, "pcm": base64.b64encode(pcm.tobytes()).decode()})
        except Aborted:
            pass
        except Exception as e:  # noqa: BLE001
            send({"kind": "error", "id": req["id"], "message": f"{type(e).__name__}: {e}", **cause(e)})
        finally:
            aborted.discard(req["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
