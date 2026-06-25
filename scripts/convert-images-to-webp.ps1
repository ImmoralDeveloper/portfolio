[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\img"),
  [string]$Destination = "",
  [ValidateRange(1, 100)]
  [int]$Quality = 82,
  [switch]$Overwrite
)

$ErrorActionPreference = "Stop"

function Get-RelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$FullPath
  )

  $baseUri = [Uri]($BasePath.TrimEnd("\") + "\")
  $fileUri = [Uri]$FullPath

  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("/", "\")
}

function Get-Converter {
  foreach ($name in @("magick", "cwebp", "ffmpeg")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue

    if ($command) {
      return $name
    }
  }

  throw "No WebP converter was found. Install ImageMagick, cwebp, or ffmpeg and run this script again."
}

function Convert-ToWebp {
  param(
    [Parameter(Mandatory = $true)][string]$Converter,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][int]$Quality,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  switch ($Converter) {
    "magick" {
      & magick $InputPath -strip -quality $Quality $OutputPath
    }
    "cwebp" {
      & cwebp -quiet -q $Quality $InputPath -o $OutputPath
    }
    "ffmpeg" {
      $overwriteFlag = if ($Overwrite) { "-y" } else { "-n" }
      & ffmpeg -hide_banner -loglevel error $overwriteFlag -i $InputPath -c:v libwebp -quality $Quality -compression_level 6 $OutputPath
    }
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to convert: $InputPath"
  }
}

$sourcePath = (Resolve-Path -LiteralPath $Source).Path

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $destinationPath = $sourcePath
} else {
  if (-not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  }

  $destinationPath = (Resolve-Path -LiteralPath $Destination).Path
}

$converter = Get-Converter
$extensions = @(".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff")
$images = Get-ChildItem -LiteralPath $sourcePath -Recurse -File |
  Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }

if (-not $images) {
  Write-Host "No convertible images found in $sourcePath"
  exit 0
}

$converted = 0
$skipped = 0

foreach ($image in $images) {
  $relativePath = Get-RelativePath -BasePath $sourcePath -FullPath $image.FullName
  $outputRelativePath = [IO.Path]::ChangeExtension($relativePath, ".webp")
  $outputPath = Join-Path $destinationPath $outputRelativePath
  $outputDirectory = Split-Path -Parent $outputPath

  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  if ((Test-Path -LiteralPath $outputPath) -and -not $Overwrite) {
    Write-Host "Skip existing: $outputPath"
    $skipped++
    continue
  }

  if ($PSCmdlet.ShouldProcess($image.FullName, "Convert to $outputPath")) {
    Convert-ToWebp -Converter $converter -InputPath $image.FullName -OutputPath $outputPath -Quality $Quality -Overwrite ([bool]$Overwrite)
    Write-Host "Converted: $outputPath"
    $converted++
  }
}

Write-Host "Done. Converted: $converted. Skipped: $skipped. Converter: $converter."
