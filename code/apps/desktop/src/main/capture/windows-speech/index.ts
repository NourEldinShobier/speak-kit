import { MAX_REPLY_CHARS, SAMPLE_RATE, TIMEOUT_MS, wavOf, type CommandNarratorDeps } from "../command-narrator";
import type { Narrator } from "../recording";

export { SAMPLE_RATE };

/** Reads a WAV file with the speech recognizer that comes with Windows (dictation grammar) and prints the words. */
export const SCRIPT = `param([string]$Wav)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.SetInputToWaveFile($Wav)
$parts = @()
try {
  while ($true) { $r = $engine.Recognize(); if ($null -eq $r) { break }; $parts += $r.Text }
} catch [System.InvalidOperationException] {
  # the engine closes its input when the file ends, and the next Recognize says so
}
$engine.Dispose()
[Console]::Out.Write(($parts -join ' '))
`;

export const windowsSpeechArgs = (script: string, wav: string): string[] => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, wav];

export interface WindowsSpeechDeps extends Omit<CommandNarratorDeps, "command"> {
  os: string;
}

/**
 * The speech recognizer of Windows as a source of narration words: the stretch of speech is written to a WAV file, PowerShell reads it with
 * System.Speech, and what it prints is the text. Only on Windows; elsewhere it is not ready and makes no words. The audio goes only to that
 * recognizer, and both files are removed afterwards.
 */
export function createWindowsSpeechNarrator(d: WindowsSpeechDeps): Narrator {
  return {
    ready: () => d.os === "win32",
    async transcribe(pcm) {
      if (d.os !== "win32") throw new Error("the Windows speech recognizer is only on Windows");
      const name = d.newName();
      const wav = await d.writeTemp(`${name}.wav`, wavOf(pcm));
      const script = await d.writeTemp(`${name}.ps1`, Buffer.from(SCRIPT, "utf8")).catch(async (e: unknown) => {
        await wav.remove().catch(() => undefined);
        throw e;
      });
      try {
        const out = await d.run("powershell.exe", windowsSpeechArgs(script.path, wav.path), TIMEOUT_MS);
        return out.replace(/\s+/g, " ").trim().slice(0, MAX_REPLY_CHARS);
      } finally {
        for (const f of [wav, script]) await f.remove().catch((e: unknown) => d.log(`capture: a temporary file was not removed (${String(e)})`));
      }
    },
  };
}
