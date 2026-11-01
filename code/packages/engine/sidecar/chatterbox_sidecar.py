"""Chatterbox sidecar for SpeakKit. Line-delimited JSON on stdin/stdout; stderr is for logs.

In:  {"op": "synth", "id": 1, "text": "...", "reference": "<wav path>" | null}
     {"op": "abort", "id": 1}   stops that request (queued or running); no reply is sent for it
Out: {"kind": "progress", "phase": "downloading" | "loading", "progress": 0..1}
     {"kind": "ready"}
     {"kind": "audio", "id": 1, "sampleRate": 24000, "pcm": "<base64 int16 little-endian>"}
     {"kind": "error", "id": 1, "message": "..."}  /  {"kind": "fatal", "message": "..."}

Exits when stdin closes. The automated tests use tests/fake-sidecar.mjs; run the real one with SPEAKKIT_REAL_CHATTERBOX=1.
"""

import base64
import json
import queue
import sys
import threading
import warnings

# The only files ChatterboxTTS reads; the repository also holds ~9 GB of multilingual and legacy weights.
WEIGHTS = ["ve.safetensors", "t3_cfg.safetensors", "s3gen.safetensors", "tokenizer.json", "conds.pt"]


class Aborted(Exception):
    pass


def main():
    # Keep library output off the protocol channel.
    out = sys.stdout
    sys.stdout = sys.stderr
    warnings.filterwarnings("ignore")

    def send(obj):
        out.write(json.dumps(obj) + "\n")
        out.flush()

    try:
        import numpy as np
        import torch
        from huggingface_hub import snapshot_download
        from tqdm import tqdm

        class Progress(tqdm):
            def update(self, n=1):
                super().update(n)
                if self.total and self.unit == "B":  # the byte bar; the "Fetching N files" bar would jump around
                    send({"kind": "progress", "phase": "downloading", "progress": min(1.0, self.n / self.total)})

        send({"kind": "progress", "phase": "downloading", "progress": 0.0})
        path = snapshot_download("ResembleAI/chatterbox", allow_patterns=WEIGHTS, tqdm_class=Progress)
        send({"kind": "progress", "phase": "loading"})
        import chatterbox.models.t3.t3 as t3
        from chatterbox.tts import ChatterboxTTS

        model = ChatterboxTTS.from_local(path, "cuda" if torch.cuda.is_available() else "cpu")
        sr = int(model.sr)
        model.generate("Hello.")  # first call compiles CUDA kernels (about 20 s); pay it before "ready", not on the first sentence
        send({"kind": "ready"})
    except Exception as e:  # noqa: BLE001
        send({"kind": "fatal", "message": f"{type(e).__name__}: {e}"})
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
            send({"kind": "error", "id": req["id"], "message": f"{type(e).__name__}: {e}"})
        finally:
            aborted.discard(req["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
