# Windows 部署与自动更新指南

本文档记录在 Windows 上通过 NSSM 服务运行 iridite/hapi，并配置全自动升级的完整流程。经验来自 2026-06-20 一次手动升级排障，目的是让以后的升级零人工干预。

## 部署架构

```
hapi-hub (NSSM 服务)          ← 主进程，持有 3006 端口
  └─ runner (手动启动)         ← 负责启动/管理 Claude Code session
hapi-tunnel (NSSM 服务)       ← cloudflared，对外暴露 hapi-hub
计划任务 \hapi\hapi-auto-update ← 每日 04:00 自动升级
```

## 初次安装

### 1. 准备目录

```powershell
New-Item -ItemType Directory -Force -Path C:\Users\<user>\hapi
```

### 2. 下载最新 nightly exe

```powershell
$release = Invoke-RestMethod "https://api.github.com/repos/iridite/hapi/releases/tags/nightly"
$asset = $release.assets | Where-Object { $_.name -match 'hapi-windows-x64-.+\.exe' } | Select-Object -First 1
Invoke-WebRequest $asset.browser_download_url -OutFile "C:\Users\<user>\hapi\hapi.exe" -UseBasicParsing
```

### 3. 安装 NSSM 服务

需要预先安装 [NSSM](https://nssm.cc/) 和 [cloudflared](https://github.com/cloudflare/cloudflared)。

```powershell
$nssm = (Get-Command nssm).Source
$hapiExe = "C:\Users\<user>\hapi\hapi.exe"
$homeDir = "C:\Users\<user>"

# hub 服务
& $nssm install hapi-hub $hapiExe
& $nssm set hapi-hub AppParameters "hub"
& $nssm set hapi-hub AppDirectory $homeDir
& $nssm set hapi-hub ObjectName ".\<user>" "<password>"
& $nssm set hapi-hub AppEnvironmentExtra `
  "ANTHROPIC_BASE_URL=<your-api-base-url>" `
  "ANTHROPIC_AUTH_TOKEN=<your-token>" `
  "ANTHROPIC_MODEL=<default-model>"
& $nssm set hapi-hub AppExit Default Restart
& $nssm set hapi-hub AppRestartDelay 5000
& $nssm set hapi-hub AppStdout "$homeDir\.hapi\logs\hapi-hub-service.log"
& $nssm set hapi-hub AppStderr "$homeDir\.hapi\logs\hapi-hub-service.err.log"
& $nssm set hapi-hub AppRotateFiles 1
& $nssm set hapi-hub AppRotateBytes 10485760
& $nssm set hapi-hub Start SERVICE_DELAYED_AUTO_START

# tunnel 服务（依赖 hub）
& $nssm install hapi-tunnel (Get-Command cloudflared).Source
& $nssm set hapi-tunnel AppParameters "tunnel run <tunnel-name>"
& $nssm set hapi-tunnel DependOnService hapi-hub
& $nssm set hapi-tunnel AppExit Default Restart
& $nssm set hapi-tunnel AppRestartDelay 3000
& $nssm set hapi-tunnel AppStdout "$homeDir\.hapi\logs\hapi-tunnel-service.log"
& $nssm set hapi-tunnel AppStderr "$homeDir\.hapi\logs\hapi-tunnel-service.err.log"
& $nssm set hapi-tunnel AppRotateFiles 1
& $nssm set hapi-tunnel AppRotateBytes 10485760
& $nssm set hapi-tunnel Start SERVICE_DELAYED_AUTO_START

Start-Service hapi-hub
Start-Sleep -Seconds 5
Start-Service hapi-tunnel
```

### 4. 启动 runner（开机自启）

在启动文件夹（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`）放一个 VBS：

```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""& 'C:\Users\<user>\hapi\hapi.exe' runner start --workspace-root 'C:\Users\<user>'"" ", 0, False
```

### 5. 注册自动更新计划任务

使用实际登录账户（不要用 SYSTEM，SYSTEM 无法访问用户级 Mihomo 代理且无法连 GitHub API）：

```powershell
$user     = '<user>'          # e.g. ollama
$password = '<password>'      # 账户密码
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"C:\Users\$user\hapi\update-hapi.ps1`""
$trigger  = New-ScheduledTaskTrigger -Daily -At '04:00'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -StartWhenAvailable -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName 'hapi-auto-update' -TaskPath '\hapi\' `
    -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest -User $user -Password $password -Force
```

## 自动更新脚本（update-hapi.ps1）

脚本放在 `C:\Users\<user>\hapi\update-hapi.ps1`，逻辑：

1. 查 GitHub API 获取最新 nightly release 的 exe 文件名（含 SHA）
2. 与本地 `.current-build` 文件比对，相同则跳过
3. 下载新 exe → 停服务 → 替换 → 重启服务
4. HTTP 健康检查（最多重试 3 次），失败则自动回滚到 `.bak`
5. 成功后写入新 SHA 到 `.current-build`

日志输出到 `~/.hapi/logs/auto-update.log`。

## 已知陷阱

### ACP 初始化失败（无害，可忽略）

runner 日志中会持续出现：

```
[ACP] Initialize attempt N failed
✘ unknown command "acp"
```

**原因**：ACP 是 Cursor 专属协议（`agent acp` 子命令），hapi 对 claude 后端也尝试初始化但会失败。这不影响 Claude Code session 的正常运行，机器仍会正常显示在线。

### Cloudflare Tunnel TLS 握手失败

症状：tunnel 日志反复出现 `TLS handshake with edge error: EOF`。

**原因**：本机跑 Mihomo/Clash TUN 模式时，cloudflared 的 DNS 解析被 fake-IP 接管，导致 TLS 握手被代理层截断。

**修复**：在 Mihomo 规则中加直连：

```yaml
- DOMAIN-SUFFIX,argotunnel.com,DIRECT
- DOMAIN-SUFFIX,cloudflareaccess.com,DIRECT
```

### hapi-hub 重启后 runner 不自动重连

**原因**：runner 是独立进程（VBS 启动），不是 hapi-hub 的子进程，hub 重启不会带动 runner 重启。

**症状**：hub 升级重启后，hapi web 显示机器离线，但 HTTP 3006 正常。

**修复**：手动重启 runner：

```powershell
# 找并停旧 runner
Get-Content "$env:USERPROFILE\.hapi\runner.state.json" | Select-String pid
Stop-Process -Id <pid> -Force -ErrorAction SilentlyContinue

# 重启
Start-Process "C:\Users\<user>\hapi\hapi.exe" `
    -ArgumentList "runner","start-sync" `
    -WorkingDirectory "C:\Users\<user>" `
    -WindowStyle Hidden
```

**长期修复建议**：将 runner 也纳入 NSSM 服务（依赖 hapi-hub），这样 hub 重启时 runner 会自动跟着重启。

### 手动停止 hapi-hub 失败（Access Denied）

直接 `Stop-Process` PID 会被拒绝，因为服务以特权账户运行。

**正确做法**：通过服务管理器停止，不要直接 kill 进程：

```powershell
Stop-Service hapi-hub -Force
```

## 日志位置速查

| 内容 | 路径 |
|------|------|
| Hub 服务输出 | `~/.hapi/logs/hapi-hub-service.log` |
| Hub 服务错误 | `~/.hapi/logs/hapi-hub-service.err.log` |
| Tunnel 错误 | `~/.hapi/logs/hapi-tunnel-service.err.log` |
| Runner 日志 | `~/.hapi/logs/<日期>-pid-<pid>-runner.log` |
| Session 日志 | `~/.hapi/logs/<日期>-pid-<pid>.log` |
| 自动更新日志 | `~/.hapi/logs/auto-update.log` |

### 计划任务不执行 / 日志无输出

**原因 1**：任务以 SYSTEM 账户运行，SYSTEM 无法访问用户级 Mihomo proxy，也没有 `gh auth` 认证，导致 GitHub API 调用失败。
**修复**：任务改用实际登录账户（`Password` logon type），见步骤 5。

**原因 2**：脚本里用反引号续行（`` ` ``）写在嵌套 try/catch 内，Windows PowerShell 5.1 解析失败（PS7 不报错），导致脚本在第一行日志之前就退出。
**修复**：改用 splatting（`@params`）消掉所有嵌套 catch 内的反引号续行。

### SYSTEM 账户无法访问 GitHub API

症状：日志报 `API rate limit exceeded` 或 `gh auth login` 提示。

原因：SYSTEM 账户无用户 profile，既没有 Mihomo proxy 设置，也没有 `gh` CLI 的 token。

修复：将计划任务 principal 改为实际用户账户（见步骤 5）。

## 待改进项

- [x] 将 runner 纳入 NSSM 服务，解决 hub 重启后 runner 断连问题
- [x] 下载时使用 GitHub 代理（ghfast.top 镜像，国内可达）
- [x] 更新后写入 Windows 事件日志（Application log，Source: hapi-updater）
