/**
 * The program of the long-lived OCR helper: Windows PowerShell 5.1 with the WinRT projection, so Windows.Media.Ocr is called without a native addon.
 * One JSON object per line on stdin ({"id":1,"png":"<base64>"}), one per line on stdout ({"id":1,"lang":"en-US","lines":[{"t":"text","x":0,"y":0,"w":10,"h":10}]}
 * or {"id":1,"error":"..."}). The first line it writes is {"ready":true,"lang":"en-US"} or {"ready":true,"lang":null} when no recognizer language is installed.
 */
export const OCR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$op1 = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation?1' } | Select-Object -First 1
function Await($op, $type) { $t = $op1.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language 'en-US')) }
$lang = if ($null -eq $engine) { $null } else { $engine.RecognizerLanguage.LanguageTag }
[Console]::Out.WriteLine((ConvertTo-Json -Compress @{ ready = $true; lang = $lang }))
[Console]::Out.Flush()
while ($null -ne ($in = [Console]::In.ReadLine())) {
  $id = 0
  try {
    $req = ConvertFrom-Json $in
    $id = [int]$req.id
    if ($null -eq $engine) { throw 'no-language' }
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $writer = New-Object Windows.Storage.Streams.DataWriter($stream)
    $writer.WriteBytes([Convert]::FromBase64String($req.png))
    $null = Await ($writer.StoreAsync()) ([uint32])
    $null = $writer.DetachStream()
    $stream.Seek(0)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @(foreach ($l in $result.Lines) {
      $x0 = [double]::MaxValue; $y0 = [double]::MaxValue; $x1 = 0.0; $y1 = 0.0
      foreach ($w in $l.Words) { $r = $w.BoundingRect; $x0 = [Math]::Min($x0, $r.X); $y0 = [Math]::Min($y0, $r.Y); $x1 = [Math]::Max($x1, $r.X + $r.Width); $y1 = [Math]::Max($y1, $r.Y + $r.Height) }
      @{ t = $l.Text; x = [int]$x0; y = [int]$y0; w = [int]($x1 - $x0); h = [int]($y1 - $y0) }
    })
    $out = ConvertTo-Json -Compress -Depth 4 @{ id = $id; lang = $lang; lines = $lines }
    $stream.Dispose(); $bitmap.Dispose()
  } catch {
    $out = ConvertTo-Json -Compress @{ id = $id; error = ([string]$_.Exception.Message) }
  }
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
}
`;
