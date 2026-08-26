Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "public\icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-Icon {
  param(
    [int]$Size,
    [string]$Path,
    [double]$Scale
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 5, 5, 8))

  $cx = $Size / 2.0
  $cy = $Size / 2.0

  $colors = @(
    [System.Drawing.Color]::FromArgb(255, 109, 77, 255),
    [System.Drawing.Color]::FromArgb(255, 34, 228, 255),
    [System.Drawing.Color]::FromArgb(255, 255, 78, 205)
  )
  $radii = @(0.315, 0.225, 0.14)
  $widths = @(0.05, 0.038, 0.03)
  $starts = @(-60, -160, -250)
  $sweeps = @(260, 240, 220)

  for ($i = 0; $i -lt 3; $i++) {
    $r = $Size * $radii[$i] * $Scale
    $rectF = New-Object System.Drawing.RectangleF (($cx - $r), ($cy - $r), (2 * $r), (2 * $r))

    $glowPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, $colors[$i].R, $colors[$i].G, $colors[$i].B)), ($Size * $widths[$i] * $Scale * 3.2)
    $glowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawArc($glowPen, $rectF, $starts[$i], $sweeps[$i])
    $glowPen.Dispose()

    $pen = New-Object System.Drawing.Pen $colors[$i], ([Math]::Max(1.5, $Size * $widths[$i] * $Scale))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($pen, $rectF, $starts[$i], $sweeps[$i])
    $pen.Dispose()
  }

  $dotR = [Math]::Max(2.0, $Size * 0.05 * $Scale)
  $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillEllipse($dotBrush, ($cx - $dotR), ($cy - $dotR), (2 * $dotR), (2 * $dotR))
  $dotBrush.Dispose()

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon -Size 192 -Path (Join-Path $out "icon-192.png") -Scale 1.0
New-Icon -Size 512 -Path (Join-Path $out "icon-512.png") -Scale 1.0
New-Icon -Size 512 -Path (Join-Path $out "maskable-512.png") -Scale 0.72

$faviconSize = 32
$favicon = New-Object System.Drawing.Bitmap $faviconSize, $faviconSize
$fg = [System.Drawing.Graphics]::FromImage($favicon)
$fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$fg.Clear([System.Drawing.Color]::FromArgb(255, 5, 5, 8))
$faviconColors = @(
  [System.Drawing.Color]::FromArgb(255, 109, 77, 255),
  [System.Drawing.Color]::FromArgb(255, 34, 228, 255),
  [System.Drawing.Color]::FromArgb(255, 255, 78, 205)
)
$faviconRadii = @(0.34, 0.24, 0.15)
for ($i = 0; $i -lt 3; $i++) {
  $r = $faviconSize * $faviconRadii[$i]
  $rectF = New-Object System.Drawing.RectangleF (($faviconSize / 2 - $r), ($faviconSize / 2 - $r), (2 * $r), (2 * $r))
  $pen = New-Object System.Drawing.Pen $faviconColors[$i], 2.2
  $fg.DrawArc($pen, $rectF, (-60 - $i * 90), 250)
  $pen.Dispose()
}
$icon = [System.Drawing.Icon]::FromHandle($favicon.GetHicon())
$icoStream = [System.IO.File]::Create((Join-Path $PSScriptRoot "public\favicon.ico"))
$icon.Save($icoStream)
$icoStream.Dispose()

Get-ChildItem $out | Select-Object Name, Length
