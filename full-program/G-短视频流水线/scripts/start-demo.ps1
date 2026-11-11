param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$port = if ($env:PORT) { $env:PORT } else { '8177' }
$base = "http://127.0.0.1:$port"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw '未找到 Node.js。请先安装 Node.js 22+，或使用 Docker 运行。' }
& node (Join-Path $root 'scripts\preflight.js')
if ($LASTEXITCODE -ne 0) { throw '提交包预检未通过，请根据上方提示补齐文件。' }
function Test-DemoHealth {
  try {
    $h = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2
    return [bool]($h.ok -and $h.name -eq '卫华短视频流水线')
  } catch { return $false }
}
if (-not (Test-DemoHealth)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $outLog = Join-Path $env:TEMP "weihua-g-$stamp.out.log"
  $errLog = Join-Path $env:TEMP "weihua-g-$stamp.err.log"
  Start-Process -FilePath $node.Source -ArgumentList 'src/server/index.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  $ready = $false
  for ($i = 0; $i -lt 30; $i += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-DemoHealth) { $ready = $true; break }
  }
  if (-not $ready) { throw "服务未就绪，请检查日志：$errLog" }
}
$url = "$base/?view=workflow"
Write-Host "演示地址：$url"
if (-not $NoBrowser) {
  $chromeCandidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  )
  $chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $url }
  else { Start-Process $url }
}
