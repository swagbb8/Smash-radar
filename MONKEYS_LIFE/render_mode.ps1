# RENDER MODE: the whole laptop works on the monkey episode and nothing else.
#   powershell -ExecutionPolicy Bypass -File render_mode.ps1        (shows what it will close, asks, then closes it)
#   powershell -ExecutionPolicy Bypass -File render_mode.ps1 -Yes   (no question)
# It closes your other programs (browsers, Discord, Steam, games...), pauses OneDrive syncing, turns the render up to High
# priority and keeps the laptop from sleeping. It never touches Windows itself, Claude, terminals, or the render.
# Afterwards just open your programs again (or restart).
param([switch]$Yes)

$keep = @('python', 'blender', 'ffmpeg', 'claude', 'node', 'WindowsTerminal', 'OpenConsole', 'conhost', 'powershell', 'pwsh', 'cmd', 'bash',
          'explorer', 'dwm', 'csrss', 'winlogon', 'svchost', 'services', 'lsass', 'smss', 'wininit', 'System', 'Idle', 'Registry', 'fontdrvhost',
          'sihost', 'ctfmon', 'taskhostw', 'RuntimeBroker', 'ShellExperienceHost', 'StartMenuExperienceHost', 'SearchHost', 'TextInputHost',
          'SecurityHealthSystray', 'MsMpEng', 'NVDisplay.Container', 'audiodg', 'ApplicationFrameHost', 'LockApp', 'Code')
# programs that hog memory from the tray even with no window open
$hogs = @('chrome', 'msedge', 'firefox', 'opera', 'brave', 'Discord', 'Spotify', 'steam', 'steamwebhelper', 'EpicGamesLauncher', 'Battle.net',
          'Teams', 'ms-teams', 'Zoom', 'RobloxPlayerBeta', 'Minecraft', 'javaw', 'EADesktop', 'Overwolf', 'Medal', 'obs64', 'WhatsApp', 'Telegram')

$me = $PID
$targets = Get-Process | Where-Object {
    $_.Id -ne $me -and $keep -notcontains $_.ProcessName -and ($hogs -contains $_.ProcessName -or $_.MainWindowHandle -ne 0)
} | Sort-Object ProcessName -Unique

if (-not $targets) { Write-Host 'Nothing else is running. Good.' }
else {
    Write-Host 'Render mode will close:' -ForegroundColor Yellow
    $targets | ForEach-Object { '   {0,-28} {1,6} MB' -f $_.ProcessName, [int]($_.WorkingSet64 / 1MB) }
    if (-not $Yes) { if ((Read-Host 'Close all of these? (y/n)') -ne 'y') { Write-Host 'Nothing closed.'; exit } }
    foreach ($name in ($targets.ProcessName | Sort-Object -Unique)) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }      # ask nicely first (lets them save)
    }
    Start-Sleep -Seconds 5
    foreach ($name in ($targets.ProcessName | Sort-Object -Unique)) { Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
}

# OneDrive: stop syncing while rendering (it restarts next time you log in)
Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# the render first, everything else after it
Get-Process python, blender -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'High' } catch {} }

# never sleep or turn the screen off-into-sleep while plugged in
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

$o = Get-CimInstance Win32_OperatingSystem
Write-Host ('RENDER MODE ON. Free memory now: {0:N1} GB of {1:N1} GB.' -f ($o.FreePhysicalMemory / 1MB), ($o.TotalVisibleMemorySize / 1MB)) -ForegroundColor Green
