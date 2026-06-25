<#
.SYNOPSIS
    ai-spec-auto 安装入口（PowerShell 薄壳）

.DESCRIPTION
    该脚本仅负责 Windows / PowerShell 入口转发。
    真正的安装、更新、检查、卸载逻辑统一由 Node 核心实现：
        node .\bin\cli.js <command>

.EXAMPLE
    .\install.ps1 init .
    .\install.ps1 update .
    .\install.ps1 check .
    .\install.ps1 uninstall . -Force
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliPath = Join-Path $scriptDir "bin\cli.js"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "x " -ForegroundColor Red -NoNewline
    Write-Host "未检测到 Node.js 环境，请先安装 Node.js 18+ 后重试。"
    exit 1
}

if (-not (Test-Path $cliPath)) {
    Write-Host "x " -ForegroundColor Red -NoNewline
    Write-Host "未找到 ai-spec-auto CLI: $cliPath"
    exit 1
}

& node $cliPath @args
exit $LASTEXITCODE
