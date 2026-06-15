# XNOW GUI 自动化测试 — 发送 Agent 任务
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

$hWnd = [WinAPI]::FindWindow($null, "?X NOW (1200422)")
if ($hWnd -eq [IntPtr]::Zero) {
    Write-Host "❌ XNOW window not found"
    exit 1
}

# Bring window to front
[WinAPI]::ShowWindow($hWnd, 1)  # SW_SHOWNORMAL
[WinAPI]::SetForegroundWindow($hWnd)
Start-Sleep -Milliseconds 500

Write-Host "✅ XNOW window activated"

# === Step 1: Click on AI panel ===
# Try Ctrl+Shift+I or click the AI tab button
# First, let's try to click on the AI input area
# The AI panel can be opened by clicking the right-side panel tab

# Send keystrokes to activate AI input
# Tab to focus the AI textarea
[System.Windows.Forms.SendKeys]::SendWait("^{F12}")  # Try toggle AI panel
Start-Sleep -Milliseconds 1000

# Type prompt in Agent mode
[System.Windows.Forms.SendKeys]::SendWait("检查当前系统的磁盘使用情况，列出所有磁盘分区的总大小、已用空间、可用空间和使用的百分比")
Start-Sleep -Milliseconds 500

# Submit
[System.Windows.Forms.SendKeys]::SendWait("+{ENTER}")
Start-Sleep -Milliseconds 500

Write-Host "✅ Agent task sent: 检查磁盘使用情况"
Write-Host "⏳ Waiting for agent to complete..."
Start-Sleep -Seconds 30

Write-Host "✅ Done. Check the app for results."
