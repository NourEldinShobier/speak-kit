import { MAX_HOURS } from "@speakkit/transcripts/pure";
import { transcripts } from "./api";
import { mixToInt16, RATE } from "./audio";

/**
 * The page of the hidden decoder window. `decodeAudioData` on a 16 kHz context resamples to 16 kHz, so only the channels have to be mixed down. The browser
 * engine decodes mp3, AAC/M4A, FLAC, Ogg Vorbis and Opus; anything it cannot read is "decode-failed".
 */
transcripts.decoder.onCommand(({ id, bytes }) => {
  void (async () => {
    try {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const audio = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(copy);
      if (audio.duration > MAX_HOURS * 3600) return transcripts.decoder.reply(id, { ok: false, code: "too-long" });
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      transcripts.decoder.reply(id, { ok: true, pcm: mixToInt16(channels) });
    } catch {
      transcripts.decoder.reply(id, { ok: false, code: "decode-failed" });
    }
  })();
});
transcripts.decoder.ready();
