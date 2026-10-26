$ErrorActionPreference = 'Stop'
$chatRoot = Split-Path -Parent $PSScriptRoot
$chatLocal = Join-Path $chatRoot '.bridge-local'
$chatLock = New-Object System.Threading.Mutex($false, 'Local\PecoPrivateChatStartup')
$chatLockHeld = $false

function Test-ChatServer([int]$Port) {
    $chatRequest = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/api/chat/session")
    $chatRequest.Proxy = $null
    $chatRequest.Timeout = 1500
    $chatRequest.AllowAutoRedirect = $false
    $chatResponse = $null
    try {
        $chatResponse = $chatRequest.GetResponse()
    } catch [System.Net.WebException] {
        $chatResponse = $_.Exception.Response
    }
    if ($null -eq $chatResponse) { return $false }
    try {
        return ([int]$chatResponse.StatusCode -eq 401 -and
            $chatResponse.ContentType -like 'application/json*' -and
            $chatResponse.Headers['X-Frame-Options'] -eq 'DENY')
    } finally {
        $chatResponse.Close()
    }
}

try {
    $chatLockHeld = $chatLock.WaitOne(0)
    if (-not $chatLockHeld) { exit 0 }
    New-Item -ItemType Directory -Path $chatLocal -Force | Out-Null
    $chatNode = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $chatConfigPath = Join-Path $chatLocal 'config.json'
    if ($env:PECO_CHAT_CONFIG) { $chatConfigPath = $env:PECO_CHAT_CONFIG }
    if (-not (Test-Path -LiteralPath $chatConfigPath)) {
        & $chatNode (Join-Path $PSScriptRoot 'setup.mjs') >> (Join-Path $chatLocal 'setup.log') 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Chat setup failed. See .bridge-local/setup.log.' }
    }
    $chatConfig = Get-Content -LiteralPath $chatConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $chatPort = 8787
    if ($chatConfig.port) { $chatPort = [int]$chatConfig.port }
    if ($chatPort -lt 1 -or $chatPort -gt 65535) { throw 'Invalid chat port.' }
    if (Test-ChatServer $chatPort) { exit 0 }

    $chatProcess = Start-Process -FilePath $chatNode -ArgumentList @('bridge/server.mjs') `
        -WorkingDirectory $chatRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $chatLocal 'server.log') `
        -RedirectStandardError (Join-Path $chatLocal 'server-error.log') -PassThru
    $chatProcess.Id | Set-Content -LiteralPath (Join-Path $chatLocal 'server.pid')
    for ($chatAttempt = 0; $chatAttempt -lt 20; $chatAttempt++) {
        if (Test-ChatServer $chatPort) { exit 0 }
        $chatProcess.Refresh()
        if ($chatProcess.HasExited) { throw 'Chat server exited. See .bridge-local/server-error.log.' }
        Start-Sleep -Milliseconds 250
    }
    throw 'Chat server did not become ready. See .bridge-local/server-error.log.'
} catch {
    $chatFailure = '{0:o} {1}' -f (Get-Date), $_.Exception.Message
    Add-Content -LiteralPath (Join-Path $chatLocal 'startup-error.log') -Value $chatFailure -Encoding UTF8
    exit 1
} finally {
    if ($chatLockHeld) { $chatLock.ReleaseMutex() }
    $chatLock.Dispose()
}
