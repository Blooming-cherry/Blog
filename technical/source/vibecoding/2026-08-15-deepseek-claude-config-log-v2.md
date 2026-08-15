---
title: 2026-08-15-deepseek-claude-config-log-v2
date: 2026-08-15
layout: page
comments: false
---

# DeepSeek × Claude Code 配置优化日志（第二版）— dsh-anchored-standard 迭代优化

第一版（`2026-08-15-deepseek-claude-config-log.md`）记录的是插件降载、`/think` 推理模板、statusline 缓存命中率。本版是同日下半程的**第二版**：调查社区开源的 `dsh-anchored-standard` 预设，把其中已被社区验证的规则迁移到我们的 Claude Code 配置上，并新增 flash 独立配置档。所有改动都有来源和依据，而非拍脑袋。

---

## 一、调查对象：dsh-anchored-standard（社区开源）

DeepSeek Harness（`@deepseek-ai`）的实验性 preset，核心思路是**两阶段工具引导**：

1. **第一个请求**（bootstrap）只暴露 Minimal 预设的真实工具对：`bash` + `str_replace_editor`，并抑制技能目录 / AGENTS.md 注入
2. 会话出现第一个**持久 promotion 信号**（`promoteOn: either` = 首次工具调用 **或** 首个 assistant 消息，二者取先）后，升级为**最小常驻集**——不是完整工具 dump，而是 bootstrap 对 + 3 个发现工具（`dev_tool_search` / `skill_search` / `skill_load`）+ 模型通过 `dev_tool_search` 显式解锁的工具
3. compaction 后**回退**到受控阶段（bootstrap 对 + `compactionTools`），直到越过边界出现新的 promotion 信号

依据源码 `tool-bootstrap.mjs`（325 行）整理出的 **8 条已验证规则**：

| # | 规则 | 实测依据（issues #6 / #11） |
|---|---|---|
| 1 | 第一个请求的工具目录决定轨迹锚点 | Minimal 工具对 5/5 锚定；任何 standard 家族 schema 11/11 滑落 |
| 2 | 第一个请求抑制技能目录注入 | 技能目录在场 0/9 完全无法锚定；无目录 ~81% |
| 3 | 第一个请求抑制 AGENTS.md 注入 | 同属自动注入，被 `suppressedContextSources` 剥离 |
| 4 | promotion 信号是**持久事件**（工具调用或首条回复），非会话内 flag | `promoteOn: either`，可跨 resume/reload 保持 |
| 5 | promotion 后暴露**最小常驻集**，而非完整 dump | 完整 dump 把轨迹拉回 standard 行为（post-promotion 回归的根因） |
| 6 | compaction 后回退受控阶段 | 把"第二次首请求"当成新的首请求对待 |
| 7 | `bootstrapMaxTokens` 可选（首个请求输出预算 cap） | 256000 下 Minimal 对无需 cap；cap 依赖 profile 包行为 |
| 8 | persona 用 `complete: true` + `includeRuntimeContext: false`，不注入 instruction 文件 | 指令文件是大型注入块，扰动轨迹 |

---

## 二、与我们之前适配的对比

- **dsh 侧**：DeepSeek Harness 自带的 agent 编排层（`agent.cordis.yml` 400 行 + `tool-bootstrap.mjs`），控制的是**模型 API 侧的工具目录与注入内容**
- **我们侧**：Claude Code 配置（`~/.claude/settings.json` / `CLAUDE.md` / memory），控制的是 **CLI 侧的能力清单与上下文注入**
- **可迁移的规则**（不依赖 Harness 运行时，纯配置即可落地）：规则 1/2/6 在 Claude Code 里对应**减少启动时注入的技能清单**；规则 4/5 对应**不让完整插件目录常驻**；规则 8 对应 CLAUDE.md 只记"坑"不重复系统提示词

---

## 三、迭代优化决策（用户选定路线）

经过 AskUserQuestion 确认，走 **配置最小化（零组件）** 路线，核心是：

### A. 全关内置技能 — `settings.json` 新增 `disableBundledSkills: true`

```json
"skipWorkflowUsageWarning": true,
"disableBundledSkills": true,
"theme": "dark"
```

- **依据**：规则 1/2（首请求技能目录注入扰动轨迹）。Claude Code 的 `disableBundledSkills` 会把内置技能/workflow **整体移除**，内置斜杠命令保留可输但隐藏于模型；插件、`.claude/skills/`、`.claude/commands/` 不受影响
- **预期效果**：技能目录从 ~55 项降到 ~16 项（只留用户技能 + 3 个插件）
- ⚠️ **需完全重启 Claude Code 才生效**——当前会话是启动时快照，验证方式是重启后 `/context` 看技能目录数量

### B. 10 个 design 系技能用 `skillOverrides: off` 隐藏（上一轮已做，保留）

### C. 插件降载（上一轮已做，保留）：`vercel` / `figma` / `chrome-devtools-mcp` / `huggingface-skills` 置 false

---

## 四、flash 独立配置 — `~/.claude/settings-flash.json`（新增）

日常学习场景需要"更快更准的简单任务"，与 pro 的深度推理分流。新建独立配置档，避免污染主配置：

```json
{
  "env": {
    "ANTHROPIC_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_SUBAGENT_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_EFFORT_LEVEL": "high",
    "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT": "1",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "256000"
  },
  "modelOverrides": {
    "deepseek-v4-flash": "deepseek-v4-flash"
  },
  "disableBundledSkills": false
}
```

设计要点与依据：

| 项 | 值 | 依据 |
|---|---|---|
| `disableBundledSkills: false` | 覆盖主配置的 `true` | `--settings` 顶层标量覆盖 user 源（CLI 参数作用域 > User）。学习场景需要轻量任务能力，保留内置技能 |
| token / base_url | **不写入** | 继承主 `settings.json` 的 env（`--settings` env 是 per-key 深合并），避免明文 token 落新文件 |
| `CLAUDE_CODE_EFFORT_LEVEL: high` | flash 档 | flash 的 reasoning 档位，比 pro 的 xhigh 降一档，省预算 |
| 用法 | `claude --settings ~/.claude/settings-flash.json --model deepseek-v4-flash` | `--model` 显式指定最可靠（见第五节） |

> **注意**：`ANTHROPIC_MODEL` 依赖 env 覆盖，而系统进程 env 已有一套完整的 `ANTHROPIC_*` 变量（`ANTHROPIC_MODEL=deepseek-v4-pro`），使 settings env 覆盖**不可靠**。实测 `--model deepseek-v4-flash` 显式 flag 最稳定，flash 档统一用它。

---

## 五、modelOverrides 调试结论（本次踩坑核心）

### 现象
配置 flash 后，每次启动都报 `[claude-code:unrecognized_model] {"model":"deepseek-v4-flash"}`。目标是让模型被"认识"。

### 调试过程（三次尝试全部实测）

1. **对象形式** `{name, isCustom, contextWindow, reasoning}` → **被 schema 拒绝**：`modelOverrides.deepseek-v4-flash: Expected string, but received object`。说明本版本（2.1.233）**不存在**"声明自定义模型"的对象形式，只接受字符串
2. **字符串身份映射** `"deepseek-v4-flash": "deepseek-v4-flash"` → schema 接受，但警告**仍在**
3. **env 开关** `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`（settings env + shell 层都试）→ 警告**仍在**

### 根因（Web 检索 + schema 描述交叉确认）

`modelOverrides` 的正确语义是 **"Anthropic 内置模型 ID → provider 特定模型 ID"的映射**（schema 原文：*Override mapping from Anthropic model ID (e.g. `claude-opus-4-6`) to provider-specific model ID (e.g. a Bedrock inference profile ARN). Typically set in managed settings by enterprise administrators.*）。

- 它的**键必须是 Claude Code 内置认识的模型 ID**，值是自定义 ID（如 Bedrock ARN）
- `deepseek-v4-flash` 不是内置条目，查表永远不会命中 → 身份映射等于没配
- `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` 只抑制 auto-compact 的 200k 窗口副作用，**不消除诊断本身**
- 结论：**`unrecognized_model` 是无害诊断**。实测 API 正常返回 `OK`、exit 0，只是 auto-compact 会按 200k 假设窗口。用 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=256000` 声明真实窗口即可

### 实际处理
- flash 档：env 加 `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1` + `CLAUDE_CODE_MAX_CONTEXT_TOKENS=256000`，消除窗口副作用
- 主配置 `settings.json` 的同类改动被 **auto-mode 分类器拒绝**（给 pro 禁用窗口 enforce 超出了本次授权范围），尊重决定，未强改

---

## 六、当前配置架构

```
默认（pro）        → ~/.claude/settings.json        → 全量工具 + disableBundledSkills:true（重启生效）
flash 独立档       → --settings settings-flash.json → 保留内置技能 + flash 模型 + 256k 窗口
  + --model deepseek-v4-flash                       → 显式指定，绕过 env 覆盖不可靠
ds-reason（一版）  → settings-reason.json + mcp-empty.json → 纯推理，无 hooks / 无 MCP
任意会话          → /think <问题>                   → 极简深度推理模板
状态栏            → deepseek-v4-pro · N% ctx · M% cache · K% weekly → 缓存命中率可见
```

---

## 踩坑记录

| 问题 | 解决 |
|---|---|
| `modelOverrides` 对象形式被拒 | 本版本只接受字符串映射，键必须是内置模型 ID，见第五节 |
| `ANTHROPIC_MODEL` env 覆盖不可靠 | 系统进程 env 已有 `ANTHROPIC_MODEL=deepseek-v4-pro`；统一用 `--model` 显式指定 |
| `unrecognized_model` 警告反复出现 | 确认是无害诊断；`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 声明窗口即消除副作用 |
| 给主配置加同类 env 被 auto-mode 拒绝 | 尊重分类器边界，只改 flash 档，未强改主配置 |

---

## 待办 / 待验证

- [ ] **重启主 Claude Code 会话**，让 `disableBundledSkills: true` 生效，`/context` 确认技能目录 ~55 → ~16
- [ ] 用 `claude --settings ~/.claude/settings-flash.json --model deepseek-v4-flash` 开一个 flash 会话，确认无告警且保留内置技能
- [ ] 可选验证闭环：Terminal-Bench 2.1（Harbor）子集 / `harness-bench-fast` 冒烟，对比零组件前后差异

## 相关文档

- 第一版日志：`2026-08-15-deepseek-claude-config-log.md`
- 上游源码（已下载本地）：`~/.claude/tmp/dsh-src/` — `preset.yml` / `tool-bootstrap.mjs` / `agent.cordis.yml`
- 调查报告：`DeepSeek_V4_Pro_0813_报告.md`
