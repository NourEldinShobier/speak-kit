"""Chatterbox sidecar for SpeakKit. Line-delimited JSON on stdin/stdout; stderr is for logs.

In:  {"op": "synth", "id": 1, "text": "...", "reference": "<wav path>" | null}
Out: {"kind": "progress", "phase": "downloading" | "loading", "progress": 0..1}
     {"kind": "ready"}
     {"kind": "audio", "id": 1, "sampleRate": 24000, "pcm": "<base64 int16 little-endian>"}
     {"kind": "error", "id": 1, "message": "..."}  /  {"kind": "fatal", "message": "..."}

Not covered by the automated tests (they use tests/fake-sidecar.mjs); run with SPEAKKIT_REAL_CHATTERBOX=1.
"""

import base64
import json
import sys


def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    # Keep library output off the protocol channel.
    real_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        import numpy as np
        import torch
        from huggingface_hub import snapshot_download
        from tqdm import tqdm

        class Progress(tqdm):
            def update(self, n=1):
                super().update(n)
                if self.total:
                    send_to(real_stdout, {"kind": "progress", "phase": "downloading", "progress": min(1.0, self.n / self.total)})

        def send_to(out, obj):
            out.write(json.dumps(obj) + "\n")
            out.flush()

        send_to(real_stdout, {"kind": "progress", "phase": "downloading", "progress": 0.0})
        snapshot_download("ResembleAI/chatterbox", tqdm_class=Progress)
        send_to(real_stdout, {"kind": "progress", "phase": "loading"})
        from chatterbox.tts import ChatterboxTTS

        model = ChatterboxTTS.from_pretrained(device="cuda" if torch.cuda.is_available() else "cpu")
        sr = int(model.sr)
        send_to(real_stdout, {"kind": "ready"})
    except Exception as e:  # noqa: BLE001
        real_out = real_stdout
        real_out.write(json.dumps({"kind": "fatal", "message": f"{type(e).__name__}: {e}"}) + "\n")
        real_out.flush()
        return 1

    for line in sys.stdin:
        req = {}
        try:
            req = json.loads(line)
            if req.get("op") != "synth":
                continue
            wav = model.generate(req["text"], audio_prompt_path=req.get("reference"))
            pcm = (wav.squeeze().cpu().numpy().clip(-1, 1) * 32767).astype(np.int16)
            send_to(real_stdout, {"kind": "audio", "id": req["id"], "sampleRate": sr, "pcm": base64.b64encode(pcm.tobytes()).decode()})
        except Exception as e:  # noqa: BLE001
            send_to(real_stdout, {"kind": "error", "id": req.get("id", 0), "message": f"{type(e).__name__}: {e}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
