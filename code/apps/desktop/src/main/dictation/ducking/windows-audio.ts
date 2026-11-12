import { classifyOutput, type MediaSession, type OutputKind, type SystemVolume } from "@speakkit/dictation";

// Core Audio through COM interop, in one PowerShell kept alive: master volume and mute of the default output, its peak level (is anything playing) and its name.
export const WINDOWS_AUDIO_LOOP = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SpeakAudio {
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int m, out IntPtr d); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); int OpenPropertyStore(int access, out IPropertyStore ps); }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { int GetCount(out int c); int GetAt(int i, out PropKey k); int GetValue(ref PropKey k, out PropVariant v); }
  [StructLayout(LayoutKind.Sequential)] struct PropKey { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Sequential)] struct PropVariant { public ushort vt; public ushort a; public ushort b; public ushort c; public IntPtr p; public IntPtr q; }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr n); int UnregisterControlChangeNotify(IntPtr n); int GetChannelCount(out int c);
    int SetMasterVolumeLevel(float l, ref Guid g); int SetMasterVolumeLevelScalar(float l, ref Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
    int SetChannelVolumeLevel(uint ch, float l, ref Guid g); int SetChannelVolumeLevelScalar(uint ch, float l, ref Guid g); int GetChannelVolumeLevel(uint ch, out float l); int GetChannelVolumeLevelScalar(uint ch, out float l);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation { int GetPeakValue(out float p); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant v);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, int flags, int extra);
  static IMMDevice Dev() { var e = (IMMDeviceEnumerator)new Enumerator(); IMMDevice d; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d)); return d; }
  static T Act<T>(string iid) { object o; var g = new Guid(iid); Marshal.ThrowExceptionForHR(Dev().Activate(ref g, 23, IntPtr.Zero, out o)); return (T)o; }
  static IAudioEndpointVolume Vol() { return Act<IAudioEndpointVolume>("5CDF2C82-841E-4546-9722-0CF74078229A"); }
  public static float Get() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { var g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref g)); }
  public static bool Muted() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMuted(bool m) { var g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol().SetMute(m, ref g)); }
  public static float Peak() { float p; Marshal.ThrowExceptionForHR(Act<IAudioMeterInformation>("C02216F6-8C67-4B5B-9D00-D008E73E0064").GetPeakValue(out p)); return p; }
  public static string Name() {
    IPropertyStore ps; Marshal.ThrowExceptionForHR(Dev().OpenPropertyStore(0, out ps));
    var k = new PropKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    PropVariant v; Marshal.ThrowExceptionForHR(ps.GetValue(ref k, out v));
    try { return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : ""; } finally { PropVariantClear(ref v); }
  }
  public static void PlayPause() { keybd_event(0xB3, 0, 0, 0); keybd_event(0xB3, 0, 2, 0); }
}
'@
[Console]::Out.WriteLine('ready')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $out = 'error'
  try {
    $a = $l.Split(' ')
    $inv = [cultureinfo]::InvariantCulture
    switch ($a[0]) {
      'volume' { $out = [SpeakAudio]::Get().ToString($inv) }
      'setvolume' { [SpeakAudio]::Set([single]::Parse($a[1], $inv)); $out = 'ok' }
      'muted' { $out = if ([SpeakAudio]::Muted()) { '1' } else { '0' } }
      'setmuted' { [SpeakAudio]::SetMuted($a[1] -eq '1'); $out = 'ok' }
      'peak' { $out = [SpeakAudio]::Peak().ToString($inv) }
      'name' { $out = [SpeakAudio]::Name() }
      'playpause' { [SpeakAudio]::PlayPause(); $out = 'ok' }
    }
  } catch { $out = 'error' }
  [Console]::Out.WriteLine($out)
}
`;

export interface AudioParts {
  media: MediaSession;
  volume: SystemVolume;
  output(): Promise<OutputKind>;
}

/** Peak above this on the default output means something is playing. */
export const PLAYING_PEAK = 0.002;
const PEAK_READS = 4;
const PEAK_GAP_MS = 60;
const STEP_MS = 40;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The Windows side of ducking, over a helper that answers one command per line. A command that does not answer `ok` (or a number) rejects. */
export function windowsAudio(ask: (command: string) => Promise<string>, sleep: (ms: number) => Promise<void> = wait): AudioParts {
  const number = async (command: string): Promise<number> => {
    const n = Number(await ask(command));
    if (!Number.isFinite(n)) throw new Error(`${command} failed`);
    return n;
  };
  const done = async (command: string): Promise<void> => {
    if ((await ask(command)) !== "ok") throw new Error(`${command} failed`);
  };
  const volume: SystemVolume = {
    get: () => number("volume"),
    async ramp(to, ms) {
      const from = await number("volume");
      const steps = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 1; i <= steps; i++) {
        await done(`setvolume ${(from + ((to - from) * i) / steps).toFixed(4)}`);
        if (i < steps) await sleep(ms / steps);
      }
    },
    muted: async () => (await ask("muted")) === "1",
    setMuted: (on) => done(`setmuted ${on ? 1 : 0}`),
  };
  // The media key toggles, so it is only sent after audio was heard playing, and the second press only undoes the first.
  const media: MediaSession = {
    async playing() {
      for (let i = 0; i < PEAK_READS; i++) {
        if ((await number("peak")) > PLAYING_PEAK) return true;
        if (i < PEAK_READS - 1) await sleep(PEAK_GAP_MS);
      }
      return false;
    },
    pause: () => done("playpause"),
    play: () => done("playpause"),
  };
  return { media, volume, output: async () => classifyOutput(await ask("name")) };
}
