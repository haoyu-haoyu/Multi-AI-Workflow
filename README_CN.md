<div align="center">

# Multi-AI Workflow (MAW)

### *释放 AI 协作的力量*

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<br/>

```
   __  __   _  __        __
  |  \/  | /_\ \ \      / /
  | |\/| |/ _ \ \ \ /\ / /
  | |  | / ___ \ \ V  V /
  |_|  |_/_/   \_\_\_/\_/

  多 AI 协作工作流框架
```

**Claude + Codex + Gemini = 无所不能**

[功能特性](#功能特性) | [安装](#安装) | [快速开始](#快速开始) | [工作流模式](#工作流模式) | [在 Claude Code 中使用](#在-claude-code-中使用)

[English](README.md)

</div>

---

## MAW 是什么？

**MAW (Multi-AI Workflow)** 是一个革命性的 CLI 框架，能够协调多个 AI 智能体无缝协作。想象一下，Claude 的推理能力、Codex 的代码执行能力、Gemini 的多模态分析能力，在你的项目中和谐地协同工作。

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [CLAUDE]           [CODEX]            [GEMINI]             │
│   规划与推理          代码执行           多模态分析            │
│                      与分析                                  │
│                                                              │
│         \                |               /                   │
│          \               |              /                    │
│           \              |             /                     │
│            v             v            v                      │
│         +-------------------------------+                    │
│         |        MAW 编排器             |                    │
│         |      统一会话控制             |                    │
│         +-------------------------------+                    │
│                        |                                     │
│                        v                                     │
│              +-----------------+                             │
│              |     你的代码     |                             │
│              +-----------------+                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 功能特性

### 多 AI 委托
将任务委托给最合适的 AI。Claude 负责规划，Codex 负责执行，Gemini 负责分析。

### 7 级工作流
| 级别 | 描述 |
|------|------|
| **Lite** | 立即执行，无规划 |
| **Lite-Plan** | 快速规划后执行 |
| **Plan** | 标准规划工作流 |
| **TDD-Plan** | 测试驱动开发 |
| **Brainstorm** | 多角色头脑风暴 |
| **Five-Phase** | 专业五阶段协作 |
| **Ralph Loop** | 迭代式 AI 循环直到完成 |

### 智能路由
根据任务内容自动选择最佳 AI。

### 报告生成
自动生成带图表的专业报告。

### 实时仪表板
支持 WebSocket 实时更新的可视化工作流管理。

### 统一会话
单一会话 ID 跨所有 AI 智能体同步。

---

## 安装

### 环境要求

- Node.js >= 18.0.0
- Python >= 3.9
- [Claude Code](https://claude.ai/code) CLI
- [Codex CLI](https://github.com/openai/codex) (可选)
- [Gemini CLI](https://github.com/google/gemini-cli) (可选)

### 快速安装（推荐）

```bash
# 克隆并运行安装脚本
git clone https://github.com/haoyu-haoyu/Multi-AI-Workflow.git
cd Multi-AI-Workflow
./install.sh

# 重启终端或重新加载配置
source ~/.zshrc  # 或 ~/.bashrc

# 验证安装
maw --version
```

安装脚本会自动：
- 将 MAW CLI 安装到 `~/.maw/`
- 设置全局 `maw` 命令
- 安装 Claude Code 斜杠命令
- 配置 PATH 环境变量

### 手动安装

```bash
# 1. 克隆仓库
git clone https://github.com/haoyu-haoyu/Multi-AI-Workflow.git
cd Multi-AI-Workflow

# 2. 安装 Node.js 依赖
npm install

# 3. 构建项目
npm run build

# 4. 安装 Python bridges
pip install -e bridges/

# 5. 复制到全局目录
mkdir -p ~/.maw/bin
cp -r maw ~/.maw/

# 6. 创建全局命令
echo '#!/bin/bash
node ~/.maw/maw/bin/maw.js "$@"' > ~/.maw/bin/maw
chmod +x ~/.maw/bin/maw

# 7. 添加到 PATH（添加到 ~/.zshrc 或 ~/.bashrc）
echo 'export PATH="$HOME/.maw/bin:$PATH"' >> ~/.zshrc

# 8. 安装 Claude Code 斜杠命令
mkdir -p ~/.claude/commands
cp claude-commands/*.md ~/.claude/commands/

# 9. 重启终端并验证
maw --help
```

### 安装目录结构

安装完成后，`~/.maw` 目录结构如下：

```
~/.maw/
├── bin/
│   └── maw              # 全局命令
├── maw/                  # MAW CLI
│   ├── bin/maw.js
│   └── dist/
└── skills/               # 已安装的技能
    ├── collaborating-with-gemini/
    ├── collaborating-with-codex/
    └── report-generator/
```

### 配置 API 密钥（可选）

如果使用 Gemini 代理 API：
```bash
# 编辑 bridge 配置文件
# 文件位置: ~/.maw/skills/collaborating-with-gemini/scripts/gemini_bridge.py
# 设置你的 API 密钥和 Base URL
```

---

## 快速开始

```bash
# 智能路由 - 自动选择最佳 AI
maw run "分析这个代码库的结构"

# 执行简单工作流
maw workflow lite "修复 README 中的拼写错误"

# 标准规划工作流
maw workflow plan "实现用户认证功能"

# 五阶段专业工作流
maw workflow five-phase "重构认证模块"

# 委托给特定 AI
maw delegate codex "编写单元测试" --cd .
maw delegate gemini "分析这个架构"

# 打开仪表板
maw view
```

---

## 工作流模式

### 1. Lite 模式 - 立即执行

```
用户任务 ────────► 直接执行 ────────► 结果
```

**适用场景：** 简单修复、小改动、一次性任务

```bash
maw workflow lite "给这个函数添加注释"
maw workflow lite "格式化这个文件"
maw workflow lite "把所有 console.log 改成 logger.debug"
```

**特点：**
- 无规划过程
- 立即行动
- 耗时最短
- 适合明确简单的任务

---

### 2. Lite-Plan 模式 - 快速规划

```
用户任务 ────► 快速规划 (1-2步) ────► 执行 ────► 结果
```

**适用场景：** 中等复杂度任务、快速开发

```bash
maw workflow lite-plan "给 API 添加错误处理"
maw workflow lite-plan "实现一个简单的缓存功能"
```

**特点：**
- 快速制定 1-3 步计划
- 耗时较短
- 适合需要简单组织步骤的任务

---

### 3. Plan 模式 - 标准规划（默认）

```
用户任务
    │
    ▼
┌──────────┐
│  规划    │  ← 分析需求、设计方案、拆分任务
└────┬─────┘
     │
     ▼
┌──────────┐
│  审查    │  ← 检查计划可行性
└────┬─────┘
     │
     ▼
┌──────────┐
│  执行    │  ← 按计划逐步实现
└────┬─────┘
     │
     ▼
┌──────────┐
│  验证    │  ← 确认结果符合预期
└────┬─────┘
     │
     ▼
   结果
```

**适用场景：** 日常开发、标准功能

```bash
maw workflow plan "实现用户登录功能"
maw workflow plan "添加数据库连接池"
maw workflow plan "重构这个模块的错误处理"
```

**执行过程：**
1. 接收任务
2. 分析需求和现有代码
3. 制定详细计划
4. 审查计划可行性
5. 按计划逐步执行
6. 验证结果

---

### 4. TDD-Plan 模式 - 测试驱动开发

```
用户任务
    │
    ▼
┌────────────────┐
│  编写测试用例   │  ← RED: 先写测试！定义期望行为
│  (RED)         │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  运行测试       │  ← 确认测试失败（功能还没实现）
│  (确认失败)     │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  实现功能       │  ← GREEN: 编写最少代码让测试通过
│  (GREEN)       │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  重构优化       │  ← REFACTOR: 在测试保护下优化代码
│  (REFACTOR)    │
└───────┬────────┘
        │
        ▼
  完成（带测试覆盖）
```

**适用场景：** 核心业务逻辑、API、关键功能

```bash
maw workflow tdd-plan "实现订单计算逻辑"
maw workflow tdd-plan "添加用户权限验证"
maw workflow tdd-plan "实现支付接口"
```

**特点：**
- 测试先行
- 保证代码质量
- 耗时较长，但代码质量高
- 适合需要高可靠性的功能

---

### 5. Brainstorm 模式 - 多角色头脑风暴

```
用户主题
    │
    ▼
┌─────────────────────────────────────────┐
│           多角色讨论                     │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ 架构师   │  │ 开发者   │  │  QA    │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │             │            │      │
│       └──────────┬──┴────────────┘      │
│                  │                      │
│                  ▼                      │
│          讨论 & 辩论                    │
│        不同视角的观点                   │
└─────────────────────────────────────────┘
                   │
                   ▼
          ┌──────────────┐
          │   综合结论    │
          │   最佳方案    │
          └──────────────┘
```

**适用场景：** 架构设计决策、技术选型、复杂问题分析

```bash
maw workflow brainstorm "API 设计方案"
maw workflow brainstorm "数据库选型"
maw workflow brainstorm "性能优化策略"
```

**角色分工：**
| 角色 | 关注点 |
|------|--------|
| 架构师 | 整体设计、可扩展性、技术债务 |
| 开发者 | 实现难度、开发效率、代码质量 |
| QA | 可测试性、边界情况、潜在问题 |

---

### 6. Five-Phase 模式 - 五阶段专业协作

```
用户任务
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 1: 上下文收集                          [Claude]    │
│ - 分析项目结构                                          │
│ - 理解现有代码                                          │
│ - 收集相关信息                                          │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 2: 多 AI 分析                    [Codex + Gemini]  │
│                                                         │
│   ┌─────────────┐              ┌─────────────┐         │
│   │   Codex     │    并行执行   │   Gemini    │         │
│   │  代码层面   │◄────────────►│  架构层面   │         │
│   │   分析      │              │   分析      │         │
│   └─────────────┘              └─────────────┘         │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 3: 原型设计                            [Claude]    │
│ - 综合分析结果                                          │
│ - 设计初步方案                                          │
│ - 创建代码骨架                                          │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 4: 完整实现                            [Claude]    │
│ - 完善代码实现                                          │
│ - 处理边界情况                                          │
│ - 添加错误处理                                          │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 5: 审计验证                  [Claude+Codex+Gemini] │
│ - 代码审查                                              │
│ - 安全检查                                              │
│ - 最终验证                                              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
  完成（高质量、经过多 AI 验证的结果）
```

**适用场景：** 大型功能开发、系统重构、关键业务模块

```bash
maw workflow five-phase "实现完整的支付系统"
maw workflow five-phase "重构数据库访问层"
maw workflow five-phase "实现 OAuth2 认证"
```

**执行过程：**
```
阶段 1 [Claude]: 收集上下文 (2-3 分钟)
阶段 2 [Codex+Gemini]: 并行分析 (3-5 分钟)
阶段 3 [Claude]: 原型设计 (2-3 分钟)
阶段 4 [Claude]: 完整实现 (5-10 分钟)
阶段 5 [All]: 审计验证 (2-3 分钟)
总耗时：15-25 分钟，但质量最高
```

---

### 7. Ralph Loop 模式 - 迭代式 AI 开发

Ralph Loop 灵感来自 "Ralph 技术" - 一种持续 AI 智能体循环，用于迭代开发直到任务完成。

```
                     ┌──────────────────────────────────────┐
                     │            RALPH LOOP                │
                     │      "坚持就是胜利"                   │
                     └──────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    ┌──────────┐                                                     │
│    │  Prompt  │ ◄───────────────────────────────────┐               │
│    │  (固定)  │                                     │               │
│    └────┬─────┘                                     │               │
│         │                                           │               │
│         ▼                                           │               │
│    ┌──────────┐                                     │               │
│    │    AI    │  ← Claude/Codex/Gemini/Auto         │               │
│    │   执行    │                                     │               │
│    └────┬─────┘                                     │               │
│         │                                           │               │
│         ▼                                           │               │
│    ┌──────────┐     否      ┌───────────────────┐  │               │
│    │ 完成了?  ├────────────►│   下一次迭代      │──┘               │
│    │          │             │  (AI 看到之前     │                   │
│    └────┬─────┘             │   的工作成果)     │                   │
│         │ 是                └───────────────────┘                   │
│         ▼                                                           │
│    ┌──────────┐                                                     │
│    │   完成   │  ← 检测到完成标记                                    │
│    └──────────┘                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**适用场景：** 有明确成功标准的任务、迭代改进、自动验证

```bash
# 基本用法
maw workflow ralph "构建一个 TODO REST API。完成后输出 <promise>COMPLETE</promise>"

# 带选项
maw workflow ralph "实现带测试的用户认证" \
  --max-iterations 30 \
  --completion-promise "COMPLETE" \
  --ai auto \
  --verbose
```

**核心概念：**
| 概念 | 说明 |
|------|------|
| **完成标记** | 表示任务完成的信号短语 |
| **迭代** | 每次循环，AI 可以看到之前的工作 |
| **持久性** | 持续尝试直到成功（在最大迭代次数内）|
| **自我纠正** | AI 从之前迭代的失败中学习 |

**何时使用：**
- ✅ 有明确、可测试成功标准的任务
- ✅ 需要迭代改进的任务
- ✅ 有自动验证的任务（测试、linter）
- ❌ 需要人类判断的任务
- ❌ 完成标准不清晰的任务

---

## 模式对比

| 模式 | 复杂度 | 耗时 | AI 参与 | 适用场景 |
|------|--------|------|---------|---------|
| **Lite** | ⭐ | 最短 | Claude | 简单修复 |
| **Lite-Plan** | ⭐⭐ | 短 | Claude | 中等任务 |
| **Plan** | ⭐⭐⭐ | 中等 | Claude | 日常开发 |
| **TDD-Plan** | ⭐⭐⭐⭐ | 较长 | Claude | 需要测试覆盖 |
| **Brainstorm** | ⭐⭐⭐ | 中等 | Claude (多角色) | 设计决策 |
| **Five-Phase** | ⭐⭐⭐⭐⭐ | 最长 | Claude+Codex+Gemini | 复杂高质量 |
| **Ralph Loop** | ⭐⭐⭐⭐ | 可变 | 自动选择 | 迭代任务 |

### 如何选择？

```
                        你的任务是什么？
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         简单修改?        功能开发?        设计决策?
              │               │               │
              ▼               │               ▼
           Lite              │          Brainstorm
                              │
                   ┌──────────┴──────────┐
                   │                     │
                   ▼                     ▼
              需要测试?              需要多AI?
                   │                     │
              ┌────┴────┐           ┌────┴────┐
              ▼         ▼           ▼         ▼
          TDD-Plan    Plan    Five-Phase   Plan
```

---

## 在 Claude Code 中使用

### 斜杠命令

MAW 为 Claude Code 提供以下斜杠命令：

| 命令 | 描述 |
|------|------|
| `/gemini <任务>` | 委托给 Gemini |
| `/codex <任务>` | 委托给 Codex |
| `/maw <命令>` | 执行 MAW 命令 |
| `/report <主题>` | 生成带图表的报告 |
| `/ralph-loop <提示>` | 启动迭代式 AI 循环 |

**示例：**
```
/gemini 分析这段代码的性能问题
/codex 为认证模块编写单元测试
/maw workflow plan "实现缓存层"
/ralph-loop "构建带测试的 REST API。完成后输出 COMPLETE"
/report "系统架构概述"
```

### 自然语言

你也可以使用自然语言与 Claude 交互：

| 你说 | Claude 做 |
|------|-----------|
| "让 Gemini 分析这个..." | 调用 Gemini bridge |
| "委托 Codex..." | 调用 Codex bridge |
| "用 MAW..." | 启动 MAW 工作流 |
| "生成一份关于...的报告" | 运行报告生成器 |

**示例：**
```
"让 Gemini 分析一下这个模块的架构"
"委托 Codex 为这个函数写测试"
"用 MAW 五阶段工作流重构认证系统"
"生成一份关于 API 设计的报告，需要包含图表"
```

### 多 AI 协作触发词

```
"用多个 AI 协作完成..."
"让 Claude 规划，Codex 执行..."
"启动五阶段协作工作流..."
```

---

## 报告生成

MAW 可以生成带有自动生成图表的专业报告：

```bash
# 使用斜杠命令
/report "机器学习管道架构"

# 直接使用 Python 脚本
python ~/.maw/skills/report-generator/report_generator.py \
  --topic "系统设计" \
  --content "你的研究内容..." \
  --output report.md
```

**功能：**
- 自动分析内容结构
- 识别需要图表的位置
- 生成 Mermaid 图表（或可用时生成图片）
- 专业学术风格输出

**工作流程：**
```
用户输入内容
    │
    ▼
┌─────────────────────────────────┐
│  Gemini 分析内容，自动识别：      │
│  - 哪些概念需要图表说明          │
│  - 建议什么类型的图表            │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  尝试生成图片：                  │
│  1. 先尝试原生图片生成 (PNG)     │
│  2. 如果失败 → 自动降级为 Mermaid │
└─────────────────────────────────┘
    │
    ▼
最终报告（包含自动生成的图表）
```

---

## 项目架构

```
Multi-AI-Workflow/
│
├── maw/                       # TypeScript CLI 核心
│   ├── src/
│   │   ├── cli.ts            # CLI 入口
│   │   ├── commands/         # 命令实现
│   │   │   ├── delegate.ts   # AI 委托 + 语义路由
│   │   │   ├── workflow.ts   # 工作流执行
│   │   │   └── session.ts    # 会话管理
│   │   └── core/             # 核心模块
│   │       ├── workflow-engine.ts   # 6级工作流
│   │       ├── session-manager.ts
│   │       └── skill-registry.ts
│   └── bin/maw.js            # CLI 可执行文件
│
├── bridges/                   # Python AI Bridges
│   └── src/maw_bridges/
│       ├── codex_bridge.py   # Codex CLI 包装器
│       └── gemini_bridge.py  # Gemini CLI/API 包装器
│
├── dashboard/                 # Web 仪表板
│   ├── src/
│   │   ├── server.ts         # Express + WebSocket
│   │   ├── storage.ts        # SQLite 数据库
│   │   └── maw-bridge.ts     # CLI 数据集成
│   └── public/               # 前端 SPA
│
└── .maw/                      # 配置和技能
    ├── config.json
    └── skills/               # 已安装的技能
```

---

## 配置

MAW 配置存储在 `.maw/config.json`：

```json
{
  "ai": {
    "claude": { "enabled": true },
    "codex": { "enabled": true, "cliPath": "codex" },
    "gemini": { "enabled": true, "cliPath": "gemini" }
  },
  "workflow": {
    "defaultLevel": "plan",
    "parallelExecution": true,
    "maxConcurrency": 2
  },
  "security": {
    "defaultSandbox": "read-only",
    "maxExecutionTime": 300000
  },
  "dashboard": {
    "port": 3000,
    "autoOpen": true
  }
}
```

### 沙箱级别

| 级别 | 描述 | 适用场景 |
|------|------|----------|
| `read-only` | 不能修改任何文件 | 代码分析、审计 |
| `workspace-write` | 可以修改项目文件 | 日常开发 |
| `full-access` | 完全控制权限 | 系统级操作 |

---

## 命令参考

### 工作流命令

```bash
maw workflow lite <任务>        # 立即执行
maw workflow lite-plan <任务>   # 快速规划+执行
maw workflow plan <任务>        # 标准规划
maw workflow tdd-plan <任务>    # 测试驱动开发
maw workflow brainstorm <主题>  # 多角色头脑风暴
maw workflow five-phase <任务>  # 五阶段协作
maw workflow ralph <提示>       # 迭代式 AI 循环

# Ralph Loop 选项
maw workflow ralph "构建功能 X" \
  --max-iterations 30 \
  --completion-promise "COMPLETE" \
  --ai auto \
  --verbose
```

### 委托命令

```bash
maw delegate codex <任务> --cd .    # 委托给 Codex
maw delegate gemini <任务>          # 委托给 Gemini
maw run <任务>                      # 智能路由
```

### 会话命令

```bash
maw session list              # 列出所有会话
maw session new <名称>        # 创建新会话
maw session resume <id>       # 恢复会话
maw session sync              # 跨 AI 同步
```

### 其他命令

```bash
maw view                      # 打开仪表板
maw skill list                # 列出已安装技能
maw skill install <来源>      # 安装技能
```

---

## 快速参考卡

```
╔═══════════════════════════════════════════════════════════════════╗
║                    Claude Code 中使用 MAW                          ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  【斜杠命令】                                                       ║
║    /gemini <任务>              委托给 Gemini                        ║
║    /codex <任务>               委托给 Codex                         ║
║    /maw workflow <级别> <任务>  执行工作流                          ║
║    /maw run <任务>             智能路由                             ║
║    /report <主题>              生成报告                             ║
║                                                                    ║
║  【自然语言触发词】                                                  ║
║    "让 Gemini..."  "委托 Gemini..."  "用 Gemini..."                 ║
║    "让 Codex..."   "委托 Codex..."   "用 Codex..."                  ║
║    "用 MAW..."     "启动 MAW..."     "MAW 工作流..."                ║
║    "生成报告..."   "写一份报告..."   "整理成报告..."                 ║
║                                                                    ║
║  【多 AI 协作触发】                                                  ║
║    "用多个 AI 协作完成..."                                          ║
║    "让 Claude 规划，Codex 执行..."                                  ║
║    "启动五阶段协作工作流..."                                         ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 贡献

我们欢迎贡献！请查看我们的贡献指南。

```bash
# Fork 仓库
git checkout -b feature/amazing-feature
git commit -m 'Add amazing feature'
git push origin feature/amazing-feature
# 创建 Pull Request
```

---

## 许可证

本项目基于 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

### 给我们一个 Star！

如果你觉得 MAW 有用，请考虑给我们一个 Star。

[![GitHub stars](https://img.shields.io/github/stars/haoyu-haoyu/Multi-AI-Workflow?style=social)](https://github.com/haoyu-haoyu/Multi-AI-Workflow)

---

**由 [haoyu-haoyu](https://github.com/haoyu-haoyu) 构建**

*让 AI 协作触手可及*

</div>
