param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$chatStartup = [Environment]::GetFolderPath('Startup')
$chatShortcutPath = Join-Path $chatStartup 'Peco Private Chat.lnk'
$chatLauncher = Join-Path $PSScriptRoot 'start-background.ps1'
$chatPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$chatDescription = 'Start the private Peco chat bridge and Cloudflare Tunnel at Windows sign-in.'
$chatShell = New-Object -ComObject WScript.Shell

if (Test-Path -LiteralPath $chatShortcutPath) {
    $chatExisting = $chatShell.CreateShortcut($chatShortcutPath)
    if ($chatExisting.Arguments -notlike ('*"' + $chatLauncher + '"*') -and
        ($chatExisting.TargetPath -ne $chatPowerShell -or $chatExisting.Description -ne $chatDescription)) {
        throw 'A different startup shortcut already uses this name.'
    }
}

if ($Uninstall) {
    if (Test-Path -LiteralPath $chatShortcutPath) { Remove-Item -LiteralPath $chatShortcutPath }
    Write-Output 'Peco Private Chat automatic startup disabled. The running server was kept.'
    exit 0
}

$chatShortcut = $chatShell.CreateShortcut($chatShortcutPath)
$chatShortcut.TargetPath = $chatPowerShell
$chatShortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $chatLauncher + '"'
$chatShortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$chatShortcut.WindowStyle = 7
$chatShortcut.Description = $chatDescription
$chatShortcut.Save()
Write-Output 'Peco Private Chat automatic startup enabled for the current Windows user.'
