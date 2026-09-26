---
title: DeepSeek_V4_Pro_0813_报告
date: 2026-08-15
layout: page
comments: false
---

# DeepSeek V4 Pro 0813：极简提示词 vs 全量工具环境 性能差异研究报告

> 日期：2026-08-15
> 主题：特定提示词才能触发完整思维链的原因、全量工具环境下的性能差异、速度与缓存命中率机制、日常工作与 Claude 启动配置建议

> **版本背景（2026-08-15 补记）**
> - **2026-08-10 · DSH（DeepSeek Harness）**：提交 `fix(preset): align minimal agent with RL composition`，把 minimal preset 与 RL 训练环境对齐——下文消融复现（96–99 / 91–92 / 98–99 分档）的前提。
> - **2026-08-13 · DeepSeek-V4-Pro-0813**：正式版发布，社区当日发现"极简提示词高分 / 全量工具低分"的环境过拟合现象（见 §3）。
> - **2026-08-15 · 本文档撰写**；同日对 DeepSeek `/anthropic` 网关做最小 API 实测，确认 `effort` 兼容映射与缓存命中字段（详见同日配置日志）。

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [现象描述](#2-现象描述)
3. [根因分析：RL 后训练的「环境过拟合」](#3-根因分析rl-后训练的环境过拟合)
4. [思维链的开关：提示词敏感性的三个层面](#4-思维链的开关提示词敏感性的三个层面)
5. [极简提示词（无工具）为何显著不同](#5-极简提示词无工具为何显著不同)
6. [速度与缓存命中率：机制全部在「前缀」](#6-速度与缓存命中率机制全部在前缀)
7. [对日常工作的建议](#7-对日常工作的建议)
8. [对 Claude 启动配置的具体建议](#8-对-claude-启动配置的具体建议)
9. [待验证事项与开放性结论](#9-待验证事项与开放性结论)
10. [参考资料](#10-参考资料)

---

## 1. 执行摘要

DeepSeek V4 Pro 0813（2026-08-13 发布的正式版）存在一个社区通过消融实验反复验证的确定性机制——**RL 后训练「环境过拟合」**：模型在训练时首轮只看到极简工具，因而学到"首轮工具越少 → 高效解题模式 → 触发高分推理轨迹"的隐性规则。

- 当用户以**极简提示词、不带任何工具**发起请求时，模型被引导回训练分布，思维链完整、推理质量高（社区测试 **96–99 分**）。
- 当用户处于**全量工具环境**（如 Claude Code 加载全部内置工具 + MCP server + skills）时，首轮工具清单被打破，模型误判为低效场景，切到慢速绕圈的思考轨迹（**91–92 分**），速度与缓存命中率同步劣化。

这三者（提示词敏感、全量工具差异、速度/缓存差异）源自**同一个根因**，并非多个模型在背后路由。`deepseek-v4-flash` 不受该机制影响（始终约 92 分），这解释了为什么不同模型在相同环境下表现差异巨大。

关键解法是 **Anchored-Standard 策略**：首轮只暴露最少工具、首次工具调用后再恢复全量，社区实测可复现 **98/99 分**且保留完整工具能力。

---

## 2. 现象描述

用户观察到的三类现象：

| 现象 | 具体表现 |
|---|---|
| **需要特定提示词** | 某些"焚诀"（如"请一切过程使用中文思考，使用中文回答"）能确保思维链为中文；未加时思维链变成英文；部分特殊指令（角色沉浸 / 纯分析模式）能开关思维链风格 |
| **极简 prompt 触发完整思维链** | 不带任何额外工具的极简 prompt 下，模型"启动脑子"，推理深度与质量显著高于日常工作环境 |
| **全量工具环境性能差异大** | 在 Claude Code 等全量工具加载环境下，推理质量、速度、缓存命中率与极简环境出现显著差异 |

社区还观察到同一 API 端点呈现三种截然不同的回复风格（"让我…" / "我希望我…" / "我们…"），一度被怀疑是多个隐藏模型在路由分发。

---

## 3. 根因分析：RL 后训练的「环境过拟合」

### 3.1 核心发现

对 DeepSeek Harness 源码及 2026-08-10 关键提交（`fix(preset): align minimal agent with RL composition`）的分析显示：差异更可能源于**代理环境（提示词与工具）的变化，而非不同的模型权重**。

社区消融实验逐层剥离输入参数后定位到：**模型对"第一眼看到的工具清单（Tool Schema）"极度敏感**。

### 3.2 机制推演

1. 模型在强化学习（RL）后训练阶段，训练环境通常在**第一轮只提供极简工具**（Minimal 模式）。
2. 模型学到一套逻辑："当第一轮只看到极少工具 → 代表高效解题模式 → 触发高分推理轨迹"。
3. 正式版 API 默认在第一轮就把全部工具全盘托出（Claude Code 全量加载时多达 25 个内置工具 + 各 MCP server 的 schema），打破了模型训练时建立的"心理契约"。
4. 模型误以为处于低效场景，误触发慢速、低效的思考轨迹（"Let me…"绕圈模式）。

### 3.3 消融实验数据

| 模式 | 首轮暴露工具 | 思考风格 | 测试得分 |
|---|---|---|---|
| Standard（默认） | 全部 25 个工具 | 频繁出现 "Let me…"（低效摆弄工具） | 91 ~ 92 |
| PTC | - | - | 92 |
| Minimal | 仅 2 个工具（Shell + Read） | 频繁出现 "We need…"（直奔主题）、短思考块、首行 "Good./Great./Excellent." | 96 ~ 99 |
| Anchored-Standard | 首步 Minimal，首次工具调用后恢复全部 25 个 | 介于两者之间 | 98 / 99（可复现） |

关键对比：**Pro 的得分随接口从 91/92 跃升至 96/99，而 Flash 的能力基本不随接口改变（始终 92 分）**。

> 附注：另有独立测试提出"提示词内容（如网络/生物内容）可能触发不同模型行为"的疑问，但无法建立确凿的模型身份证据，大概率仍是环境因素的变体。

---

## 4. 思维链的开关：提示词敏感性的三个层面

### 4.1 训练分布引导

特定提示词的本质作用不是"给模型更多信息"，而是**把模型从"通用分布"引导回"训练分布"**。RL 后训练的模型在特定 prompt 模板（`<think>` / `<reasoning>` 标签、固定的推理指令格式）下输出质量最高，偏离该模板越远，能力退化越明显。

### 4.2 reasoning_effort 参数（API 层）

V4 Pro 通过 `reasoning_effort` 参数控制推理强度：

| 取值 | 行为 |
|---|---|
| `none` | 直接回答，最快最便宜 |
| `high` | 先推理再回答，返回 `reasoning_content` 字段（默认） |
| `max` | 最大推理预算 |

⚠️ 重要：**不要将 `reasoning_content` 喂回对话历史**，只发送 `content` 部分；思维链 token 按输出 token 计费。

### 4.3 提示词过拟合

社区推测 V4 Pro 0813 存在"提示词过拟合"：**模型需要看到极简模式的 prompt 才"启动脑子"**，否则能力退化到没有后训练的水平；一旦被特定 prompt 激活，灰测时的完整思维链就会回来，智力大幅上升。通过官方 harness 测试发现，首次请求的工具结构对模型能力影响极大（Minimal 模式 99/96 分，Standard 只有 91/92 分）。

---

## 5. 极简提示词（无工具）为何显著不同

除"环境契约"外，另有三个独立机制叠加：

### 5.1 解码路径被工具抢占

- 无工具：输出 token 全部流向推理 + 答案。
- 有工具：模型必须生成工具调用的 JSON/XML，这些格式 token 与推理**共享同一个 logits 概率分布**，推理预算被"挤"掉。工具越多，格式约束越长，推理路径越浅。

### 5.2 上下文稀释（Context Dilution / Lost in the Middle）

25 个工具 schema 就是几千 token，把真正重要的用户指令往后推。注意力是有限预算，前端塞满 schema 意味着中后段的指令被稀释。

### 5.3 Agentic Loop 级联

有工具时模型倾向于拆成 plan → tool → observe → plan 的多步循环，每一步都重读全量上下文、累积一次偏差，最后一步的输出质量取决于前几步的级联错误。

### 5.4 工具选择成本

一次性给十几个工具会让模型选错概率上升。应按业务分组、按需加载；schema 中 `required` 字段要写清楚，参数类型要严格（number 就写 number）。

---

## 6. 速度与缓存命中率：机制全部在「前缀」

### 6.1 DeepSeek 上下文缓存机制

DeepSeek API 提供**磁盘上下文缓存**，默认对所有用户启用、无需改代码。核心规则：

- **字节级前缀匹配**：请求从第 0 个字节起必须完全一致，任何一位变化整条前缀即失效。
- **滑动窗口注意力**：每个缓存前缀是独立完整的单元，请求只有**完全匹配**已持久化的缓存前缀单元才能命中。
- 命中状态通过两个字段报告：
  - `prompt_cache_hit_tokens`：从缓存读取的输入 token
  - `prompt_cache_miss_tokens`：未命中、需重新计算的输入 token
- 缓存"尽力而为"（不保证 100%）、构建需数秒、闲置数小时到数天后自动清除。

### 6.2 命中率的实测分布

| 场景 | 命中率 |
|---|---|
| 理想单用户单日（前缀稳定） | **99.82%** |
| 精心设计的前缀管理 | **95–99%** |
| DeepSeek 原生缓存基线 | 95–98% |
| 单会话内（系统提示词可能不同） | 60–80%，新会话归零 |
| 通用 OpenAI 形状 SDK 长会话（历史重排、schema 重序列化） | 30–60% |
| XML 工具调用客户端（Cline/Continue，工具结果内联进对话） | 更低 |
| 前缀被破坏的回归案例（OpenClaw 6.10） | **<10%** |

### 6.3 前缀破坏的常见来源

- system prompt 中的动态内容：时间戳、日期、工作目录、UUID、版本号、随机 ID
- 会话历史增长 / 重排 / 就地编辑
- 非确定性的工具输出内联进对话
- 重复但不对齐的元数据块

### 6.4 代价与速度

- **成本悬殊**：缓存命中 vs 未命中约 **50–120 倍**价差。Reasonix 实测：99.82% 命中率下单日成本 ~$1.38，无缓存则 ~$61（省 ~97.7%）。
- **速度同理**：prefill（处理输入 token）与输入长度成正比。全量环境一次请求 prefill 数万 token，极简环境仅数百 → TTFT 差一个量级；agentic 多轮 round-trip 进一步放大体感延迟。

> 结论：极简场景"快 + 缓存命中率高"不是模型变快了，而是**省掉了 prefill 和缓存 miss 的代价**。

---

## 7. 对日常工作的建议

### 7.1 按任务类型分会话

| 任务类型 | 建议环境 |
|---|---|
| 纯推理 / 写作 / 读代码（不读写不改） | 极简上下文，能不开工具就不开；新开干净会话、不带项目上下文 |
| 需要动手（读写文件、跑命令） | 全量工具环境，把工具当"最后一公里"，先思考完整方案再调用 |

### 7.2 采用 Anchored-Standard 策略

社区验证唯一能"既要高分又要完整工具"的方案（98/99 分可复现）：

- DeepSeek 侧：首轮只给 2 个工具，首次工具调用后再恢复全量。
- Claude Code 近似做法：先在一个最小工具会话里把方案想清楚，再切到全量工具会话执行。

### 7.3 工具分组、按需加载

- 一次给十几个工具会让选错概率上升；按业务分组、按需加载。
- schema 中 `required` 字段写清楚，参数类型严格。

### 7.4 缓存纪律

- system prompt 和消息历史保持 **append-only**，别删改中间内容。
- 动态信息（时间、路径、随机 ID）不要放在前缀前部。
- 长会话做**确定性压缩**（temperature 0 摘要，压缩后字节永不变化）。
- 多终端共享缓存池：传 DeepSeek 的 `user_id` 参数（同一 `user_id` 共用一个缓存池）。

---

## 8. 对 Claude 启动配置的具体建议

> 本报告撰写时所处的会话即为"全量工具环境"的活样本：Claude Code 加载了全部内置工具、四个 MCP server、SessionStart hook 注入的技能说明。以下建议可直接对照 `.claude/settings.json` 与全局配置修改。

### 8.1 精简 SessionStart hook 注入

- 现状问题：启动 hook 将整段技能使用说明全文注入上下文，每次会话白占几千 token 预算，并给提示词敏感的推理模型增加一层系统级指令干扰。
- 建议：hook 里只保留一句指针（"如需技能，先调用 Skill 工具"），不要全文灌入。

### 8.2 控制 MCP server 数量——对 V4 Pro 是最大杠杆

- 现状：会话加载多个 MCP server（supermemory、chrome-devtools、claude-design、vercel 等），每个的 tool schema 都进 system prompt。
- V4 Pro 对**首轮工具清单**极敏感，工具数量直接决定推理分数档位。
- 建议：
  - `.claude/settings.json` 中默认不启用全局 MCP（`enableAllProjectMcpServers: false`）。
  - 只对用到的项目按需开 `mcpServers`。
  - 纯推理场景用 `claude --no-mcp` 启动。

### 8.3 CLAUDE.md 保持轻量

只记无法从环境自动发现的"坑"，不重复系统提示词已覆盖的内容（本用户已遵循此原则，继续维持）。

### 8.4 后端模型参数（直接走 DeepSeek API 时）

- 用 `reasoning_effort` 显式控制推理强度（`none` / `high` / `max`，默认 `high`）。
- **绝不把 `reasoning_content` 喂回对话历史**——只回传 `content`。
- 多终端共享缓存池可传 DeepSeek 的 `user_id` 参数。

### 8.5 可验证的启动配置清单

```jsonc
// .claude/settings.json（示例）
{
  "enableAllProjectMcpServers": false,   // 关键：别把全部 MCP 塞进 system prompt
  "mcpServers": {
    // 仅按需声明本项目用到的 server
  },
  "hooks": {
    "SessionStart": []                    // 移除全文注入的 hook，或精简为指针
  }
}
```

---

## 9. 待验证事项与开放性结论

- **官方未确认**：以上 0813 的"环境过拟合"结论来自社区消融实验，DeepSeek 官方尚未确认；API 文档仅将 `deepseek-v4-pro` 列为 0813 版本，未披露多模型路由机制。
- **可自证**："首轮工具暴露影响行为"有可复现数据，"前缀缓存命中率"是官方文档机制——两者都可在自有环境中直接复现验证。
- **安全维度旁证**：V4 Pro 对提示词注入/越狱呈两级分化（基础难度 0 分、进阶 97.2 分、困难 95.3 分），提示词结构对行为的影响深度可见一斑。

---

## 10. 参考资料

- [91分瞬间变99分！DeepSeek V4 Pro 性能大起大落？开源社区消融实验](https://locdd.com/t/topic/80868)
- [V4P 0813或许还有反转？](https://locdd.com/t/topic/80844)
- [难道V4Pro 0813还有反转？V4Pro后训练过拟合提示词](https://locdd.com/t/topic/80923)
- [Deepseek V4 pro 0813版本没有体现之前灰测时的思维链特征](https://locdd.com/t/topic/79790/20)
- [DeepSeek-V4 轨迹分析 20260814 (xiaobright/modeltest)](https://github.com/xiaobright/modeltest/blob/main/docs/v4.1/DEEPSEEK_V4_TRAJECTORY_ANALYSIS_20260814.md)
- [DeepSeek-TUI 提示词分析](https://github.com/DavidAlphaFox/DeepSeek-TUI/blob/main/PROMPT_ANALYSIS.md)
- [deepseek_v4_rolepaly_instruct 角色扮演思考模式切换指南](https://github.com/victorchen96/deepseek_v4_rolepaly_instruct)
- [DeepSeek-V4-Pro 在不同会话中表现出不同的行为](https://www.gatenode.irish/zh/news/detail/deepseek-v4-pro-shows-different-behaviors-across-sessions-source-may-not-be-23464755)
- [DeepSeek V4 上线：Flash / Pro 怎么选？JSON、工具调用、前缀续写、FIM](https://www.mooko.cn/article/273)
- [DeepSeek V4 Pro实测：优化提示词策略显著提升AI编程效率](https://www.80aj.com/2026/08/15/deepseek-v4-pro-ai-programming/)
- [上下文硬盘缓存 | DeepSeek API Docs](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/)
- [OpenClaw：缓存边界标记导致命中率从98%跌到<10%](https://github.com/openclaw/openclaw/issues/94518)
- [DeepSeek-Reasonix 真实世界缓存基准](https://github.com/esengine/DeepSeek-Reasonix/blob/v1/benchmarks/real-world-cache/README.md)
- [opencode-deepseek-cache 插件](https://github.com/Townrain/opencode-deepseek-cache)
- [waveloom 前缀缓存设计](https://github.com/Menfre01/waveloom/blob/main/docs/prefix-cache.en.md)
