$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desk = [Environment]::GetFolderPath("Desktop")
if (-not $desk -or -not (Test-Path -LiteralPath $desk)) {
    Write-Host "找不到桌面文件夹。"
    exit 1
}
$launch = Join-Path $here "塔塔钓鱼.bat"
if (-not (Test-Path -LiteralPath $launch)) {
    Write-Host "找不到 塔塔钓鱼.bat"
    exit 1
}
$shortcut = Join-Path $desk "塔塔钓鱼.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $launch
$link.WorkingDirectory = $here
$link.Description = "塔塔钓鱼"
$link.Save()
Write-Host "已放到桌面：$shortcut"
