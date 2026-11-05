param(
  [string]$Source = "C:\icon.png",
  [string]$OutputDirectory = "$PSScriptRoot\..\src-tauri\icons"
)

Add-Type -AssemblyName System.Drawing
$sourceImage = [System.Drawing.Image]::FromFile($Source)
$dark = [System.Drawing.Color]::FromArgb(255, 35, 36, 42)

function New-InstallerBitmap([int]$Width, [int]$Height, [string]$Path) {
  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($dark)
  $scale = [Math]::Min(($Width * 0.68) / $sourceImage.Width, ($Height * 0.68) / $sourceImage.Height)
  $size = New-Object System.Drawing.Size([int]($sourceImage.Width * $scale), [int]($sourceImage.Height * $scale))
  $x = [int](($Width - $size.Width) / 2)
  $y = [int](($Height - $size.Height) / 2)
  $graphics.DrawImage($sourceImage, $x, $y, $size.Width, $size.Height)
  $graphics.Dispose()
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Dispose()
}

New-InstallerBitmap 164 314 (Join-Path $OutputDirectory "installer-sidebar.bmp")
New-InstallerBitmap 150 57 (Join-Path $OutputDirectory "installer-header.bmp")
$sourceImage.Dispose()
