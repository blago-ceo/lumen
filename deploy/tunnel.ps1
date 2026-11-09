# Туннель для Lumen: держит сайт доступным из интернета и сам перезапускается.
# Бесплатный pinggy живёт 60 минут и каждый раз даёт новый адрес — скрипт поднимает новый
# и записывает адрес на постоянную страницу https://blago-ceo.github.io/lumen/
# Запуск: двойной клик по start-tunnel.cmd в папке lumen. Окно не закрывать.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'data'
New-Item -ItemType Directory -Force $data | Out-Null
$log = Join-Path $data 'tunnel.log'
$err = Join-Path $data 'tunnel.err.log'
$key = Join-Path $env:USERPROFILE '.ssh\pinggy_ed25519'
$Host.UI.RawUI.WindowTitle = 'Lumen туннель — не закрывать'

function Say($t, $c = 'White') { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $t) -ForegroundColor $c }

# SSH-ключ: с ним pinggy не спрашивает пароль, и перезапуск идёт без вас
if (-not (Test-Path $key)) {
  New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
  ssh-keygen -t ed25519 -N '""' -f $key -q -C 'lumen-tunnel' | Out-Null
  Say 'Создан SSH-ключ для туннеля'
}

function Ensure-Server {
  try {
    Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8790/api/health' -TimeoutSec 5 | Out-Null
    return
  } catch {}
  Say 'Сервер Lumen не отвечает — запускаю' 'Yellow'
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle = 'Lumen сервер — не закрывать'; cd '$root'; npm start"
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 2
    try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8790/api/health' -TimeoutSec 3 | Out-Null; Say 'Сервер запущен' 'Green'; return } catch {}
  }
  Say 'Сервер так и не ответил — проверьте окно сервера' 'Red'
}

function Publish($url) {
  $json = @{ url = $url; updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  $sha = gh api 'repos/blago-ceo/lumen/contents/tunnel.json?ref=gh-pages' --jq '.sha' 2>$null
  $ghArgs = @('api', '-X', 'PUT', 'repos/blago-ceo/lumen/contents/tunnel.json', '-f', "message=tunnel $url", '-f', "content=$b64", '-f', 'branch=gh-pages')
  if ($sha) { $ghArgs += @('-f', "sha=$sha") }
  gh @ghArgs 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Say "Адрес обновлён на https://blago-ceo.github.io/lumen/" 'Green' }
  else { Say 'Не удалось обновить страницу на GitHub (проверьте интернет / gh auth)' 'Red' }
}

while ($true) {
  Ensure-Server
  Remove-Item $log, $err -ErrorAction SilentlyContinue
  Say 'Поднимаю туннель…'
  $p = Start-Process ssh -PassThru -NoNewWindow -RedirectStandardOutput $log -RedirectStandardError $err -ArgumentList @(
    '-p', '443', '-i', $key,
    '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL',
    '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
    '-o', 'BatchMode=yes', '-T',
    '-R0:localhost:8790', 'free.pinggy.io'
  )

  $url = $null
  for ($i = 0; $i -lt 60 -and -not $p.HasExited; $i++) {
    Start-Sleep 1
    $text = (Get-Content $log, $err -Raw -ErrorAction SilentlyContinue) -join "`n"
    $m = [regex]::Match($text, 'https://[a-z0-9.-]+\.(pinggy-free\.link|pinggy\.net|pinggy\.link|pinggy\.online)')
    if ($m.Success) { $url = $m.Value; break }
  }

  if ($url) {
    Say "Сайт доступен: $url" 'Cyan'
    Publish $url
    try { Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 15 | Out-Null } catch {}
    $p.WaitForExit()
    Say 'Туннель закрылся (у бесплатного pinggy лимит 60 минут) — перезапускаю' 'Yellow'
  } else {
    Say 'Не получил адрес от pinggy. Вывод ssh:' 'Red'
    Get-Content $log, $err -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Write-Host "   $_" }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep 5
}
