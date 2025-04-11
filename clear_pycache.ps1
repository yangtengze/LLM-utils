# 删除所有 __pycache__ 目录
Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" |
ForEach-Object {
    Write-Host "[Cleared Path]]: $($_.FullName)" -ForegroundColor Red
    Remove-Item $_.FullName -Recurse -Force
}