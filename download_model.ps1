param (
    [string]$model = "deepseek-r1:7b"  # 默认值为 "deepseek-r1:7b"
)

while ($true) {
    # 修改检查的模型名称
    $modelExists = ollama list | Select-String $model
    if ($modelExists) {
        Write-Host "model is ready"
        break
    }

    Write-Host "download..."
    # 修改下载命令的模型名称
    $process = Start-Process -FilePath "ollama" -ArgumentList "run", $model -PassThru -NoNewWindow

    Start-Sleep -Seconds 60

    try {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
        Write-Host "kill and restart..."
    }
    catch {
        Write-Host "error"
    }
}