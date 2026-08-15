---
title: 2026-08-15-deepseek-claude-config-log
date: 2026-08-15
layout: page
comments: false
---

# DeepSeek × Claude Code 配置优化日志 — 2026-08-15

## 目标

让 `deepseek-v4-pro-0813` 在 Claude Code 里同时拿到两头好处：纯推理场景触发完整思维链（极简环境），干活场景保留全量工具（agentic 能力），并且让缓存命中率在状态栏可见。核心依据是同日完成的调查报告《DeepSeek V4 Pro 0813：极简提示词 vs 全量工具环境 性能差异研究报告》（版本背景已在报告内补记）。

## 本日改动（操作记录）

### A1. 插件降载 — `~/.claude/settings.json`
- `chrome-devtools-mcp@claude-plugins-official` → `false`（纯 MCP 插件，零附带）
- `vercel@claude-plugins-official` → `false`（会连带停用其 4 个命令 + 3 个 agent，已知悉）
- 保留启用：`frontend-design`、`superpowers`、`code-review`

### A2. 推理专用配置 — `~/.claude/settings-reason.json` + `~/.claude/mcp-empty.json`
- `settings-reason.json`：固定 `deepseek-v4-pro`、`disableAllHooks: true`、`CLAUDE_CODE_EFFORT_LEVEL=xhigh`（token 已从日志脱敏，勿外泄）
- `mcp-empty.json`：空 `mcpServers`，配合 `--strict-mcp-config` 强制 0 个 MCP server

### A4'（决策）superpowers 保留启用
按用户明确指示，superpowers 插件**不做禁用**，本轮只动 MCP 型插件。

### D1. PowerShell 双入口 — `Microsoft.PowerShell_profile.ps1`
- `ds-reason`：`--setting-sources project,local`（排除 user 源，去掉插件/hooks/用户级 MCP）+ `--strict-mcp-config --mcp-config <空>` → 纯净推理
- `ds-work`：默认全量环境，可用 `--model deepseek-v4-flash` 降成本
- 已实测：`ds-reason mcp list` → "No MCP servers configured."；`ds-work mcp list` → claude-design + supermemory 在线

### B1. effort 实测（`xhigh` 到底被翻译成什么）
对 DeepSeek `/anthropic` 网关发最小请求，`output_config.effort = "xhigh"`：

| 项 | 结果 |
|---|---|
| 是否报错 | 不报错，正常返回（官方兼容映射） |
| 实际生效 | 官方文档：`reasoning_effort` 合法值 `low/high/max`，`medium`、`xhigh` 均映射为 **`high`** |
| 结论 | 你的 `CLAUDE_CODE_EFFORT_LEVEL=xhigh` 实际是 `high`，**不是 max**；想要最大推理预算应改为 `max` |

> 补充（agent 按官方文档核实）：Claude Code 通过 `output_config.effort` 下发档位；但对固定 ID 的第三方模型（如 `deepseek-v4-pro`），若未用 `ANTHROPIC_DEFAULT_*_MODEL_SUPPORTED_CAPABILITIES` 声明 `effort` 能力，Claude Code 可能**根本不发该字段**（退化为 DeepSeek 默认 `high`）。两条路径最终都落在 `high`。

### B2. `/think` 斜杠命令 — `~/.claude/commands/think.md`
极简深度推理模板：强制不调用工具、一切过程中文思考/回答、先推理后结论、区分确凿与推测。任何会话内敲 `/think <问题>` 即可把模型拉回极简推理分布。

### C2. statusline 缓存命中率 — `D:\Clawd on Desk\...\hooks\claude-statusline.js`
- 实测确认 DeepSeek `/anthropic` 网关把 `prompt_cache_hit_tokens` 映射为 Anthropic 形状的 `cache_read_input_tokens`，而 Claude Code statusline 的 `context_window.current_usage` 正好透传该字段
- `buildStatusLineText` 新增 `computeClaudeCacheHitPercent`：命中率 = `cache_read / (input + cache_read + cache_creation)`
- 状态栏格式：`deepseek-v4-pro · 25% ctx · 68% cache · 30% weekly`；字段缺失时空安全降级，绝不影响渲染

## API 实测数据（B1/C2）

同一长前缀（约 379 token）连发两次，`deepseek-v4-pro`：

| 请求 | input_tokens | cache_read_input_tokens | cache_creation_input_tokens | 命中率 |
|---|---|---|---|---|
| 第 1 次（建缓存） | 379 | 0 | 0 | 0% |
| 第 2 次（同前缀） | 123 | 256 | 0 | ≈68% |

## 踩坑记录

| 问题 | 解决 |
|---|---|
| `--mcp-config` 是可变参数，会把后续用户参数吞成配置路径 | 加 `--` 分隔符：`--mcp-config <空> -- @args` |
| 仅 `--strict-mcp-config` 不够，仍加载了用户级 MCP | 必须配对 `--mcp-config <空>` 才强制 0 server |
| 全局 flag 必须放在子命令前 | `mcp list --strict-mcp-config` 报 unknown option |
| 状态栏脚本不能崩溃，否则状态栏空白 | 新函数全链路防御性返回 null，已用 `__test` 四组用例验证 |

## 当前架构

```
ds-reason  → settings-reason.json（无 hooks / 无 MCP / 固定 v4-pro）  → 纯推理，触发完整思维链
ds-work    → 默认配置（hooks + 插件 + MCP 全开）                     → agentic 干活
任意会话   → /think <问题>                                          → 极简推理模板
状态栏     → deepseek-v4-pro · N% ctx · M% cache · K% weekly         → 缓存命中率可见
```

## 相关文档

- 0813 / DSH 版本背景：已补记至 `DeepSeek_V4_Pro_0813_报告.md`（按要求仅改动该调查文档）
- 上游会话记录：`~/.claude/settings.json`、`~/.claude/settings-reason.json`、`~/.claude/mcp-empty.json`

## 待办 / 待验证

- [x] statusline 字段名已由 claude-code-guide agent 按官方文档核实：`context_window.current_usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`，且实测确认 DeepSeek `/anthropic` 网关确实透传该形状 —— C2 实现有效（缺字段时空安全降级）
- [x] `/think` 已加 `disallowed-tools` 把工具池移出（agent 核实：`allowed-tools` 只预批不限制，`disallowed-tools` 才从模型可用池移除）
- [ ] 下次真实会话看状态栏是否显示 `N% cache`
- [ ] 想上 `max`：`CLAUDE_CODE_EFFORT_LEVEL` 两处改为 `max`；若仍无效，用 `ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES` 等声明 `effort` 能力
- [ ] 观察 `ds-work` 下 `/think` 是否能把 Pro 拉回高分推理分布
