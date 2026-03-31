<div align="center">

# Multi-AI Workflow (MAW)

### *Unleash the Power of AI Collaboration*

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

  Multi-AI Workflow Framework
```

**Claude + Codex + Gemini = Unstoppable**

[Features](#-features) | [Installation](#-installation) | [Quick Start](#-quick-start) | [Workflow Modes](#-workflow-modes) | [Usage in Claude Code](#-usage-in-claude-code)

[中文文档](README_CN.md)

</div>

---

## What is MAW?

**MAW (Multi-AI Workflow)** is a revolutionary CLI framework that orchestrates multiple AI agents to work together seamlessly. Imagine having Claude's reasoning, Codex's code execution, and Gemini's multimodal capabilities all working in harmony on your projects.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [CLAUDE]           [CODEX]            [GEMINI]             │
│   Planning &         Code Execution     Multimodal           │
│   Reasoning          & Analysis         Analysis             │
│                                                              │
│         \                |               /                   │
│          \               |              /                    │
│           \              |             /                     │
│            v             v            v                      │
│         +-------------------------------+                    │
│         |       MAW ORCHESTRATOR        |                    │
│         |    Unified Session Control    |                    │
│         +-------------------------------+                    │
│                        |                                     │
│                        v                                     │
│              +-----------------+                             │
│              |    YOUR CODE    |                             │
│              +-----------------+                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Features

### Multi-AI Delegation
Delegate tasks to the right AI for the job. Claude plans, Codex executes, Gemini analyzes.

### 7 Workflow Modes
| Level | Description |
|-------|-------------|
| **Lite** | Instant execution, no planning |
| **Lite-Plan** | Quick planning then execute |
| **Plan** | Standard planning workflow |
| **TDD-Plan** | Test-driven development |
| **Brainstorm** | Multi-role ideation |
| **Five-Phase** | Professional 5-phase collaboration |
| **Ralph Loop** | Iterative AI loop until completion |

### Smart Routing
Auto-detect the best AI for your task based on content analysis.

### Report Generation
Generate professional reports with auto-generated diagrams.

### Real-time Dashboard
Visual workflow management with WebSocket live updates.

### Unified Sessions
Single session ID syncs across all AI agents.

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- Python >= 3.9
- [Claude Code](https://claude.ai/code) CLI
- [Codex CLI](https://github.com/openai/codex) (optional)
- [Gemini CLI](https://github.com/google/gemini-cli) (optional)

### Quick Install (Recommended)

```bash
# Clone and run the installer
git clone https://github.com/haoyu-haoyu/Multi-AI-Workflow.git
cd Multi-AI-Workflow
./install.sh

# Restart terminal or source your shell config
source ~/.zshrc  # or ~/.bashrc

# Verify installation
maw --version
```

The installer will:
- Install MAW CLI to `~/.maw/`
- Set up global `maw` command
- Install Claude Code slash commands
- Configure your PATH

### Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/haoyu-haoyu/Multi-AI-Workflow.git
cd Multi-AI-Workflow

# 2. Install Node.js dependencies
npm install

# 3. Build the project
npm run build

# 4. Install Python bridges
pip install -e bridges/

# 5. Copy to global directory
mkdir -p ~/.maw/bin
cp -r maw ~/.maw/

# 6. Create global command
echo '#!/bin/bash
node ~/.maw/maw/bin/maw.js "$@"' > ~/.maw/bin/maw
chmod +x ~/.maw/bin/maw

# 7. Add to PATH (add to ~/.zshrc or ~/.bashrc)
echo 'export PATH="$HOME/.maw/bin:$PATH"' >> ~/.zshrc

# 8. Install slash commands for Claude Code
mkdir -p ~/.claude/commands
cp claude-commands/*.md ~/.claude/commands/

# 9. Restart terminal and verify
maw --help
```

### Installation Structure

After installation, your `~/.maw` directory will look like:

```
~/.maw/
├── bin/
│   └── maw              # Global command
├── maw/                  # MAW CLI
│   ├── bin/maw.js
│   └── dist/
└── skills/               # Installed skills
    ├── collaborating-with-gemini/
    ├── collaborating-with-codex/
    └── report-generator/
```

### Configure API Keys (Optional)

For Gemini with proxy API:
```bash
# Edit the bridge configuration
# File: ~/.maw/skills/collaborating-with-gemini/scripts/gemini_bridge.py
# Set your API key and base URL
```

---

## Quick Start

```bash
# Smart routing - auto-selects best AI
maw run "Analyze this codebase structure"

# Run a simple workflow
maw workflow lite "Fix typos in README"

# Standard planning workflow
maw workflow plan "Implement user authentication"

# 5-phase professional workflow
maw workflow five-phase "Refactor the authentication module"

# Delegate to specific AI
maw delegate codex "Write unit tests" --cd .
maw delegate gemini "Analyze this architecture"

# Open the dashboard
maw view
```

---

## Workflow Modes

### 1. Lite Mode - Instant Execution

```
User Task ────────► Direct Execute ────────► Result
```

**Best for:** Simple fixes, small changes, one-time tasks

```bash
maw workflow lite "Add comments to this function"
maw workflow lite "Format this file"
maw workflow lite "Change all console.log to logger.debug"
```

---

### 2. Lite-Plan Mode - Quick Planning

```
User Task ────► Quick Plan (1-2 steps) ────► Execute ────► Result
```

**Best for:** Medium complexity tasks, quick development

```bash
maw workflow lite-plan "Add error handling to API"
maw workflow lite-plan "Implement simple caching"
```

---

### 3. Plan Mode - Standard Planning (Default)

```
User Task
    │
    ▼
┌──────────┐
│  Plan    │  ← Analyze requirements, design solution
└────┬─────┘
     │
     ▼
┌──────────┐
│  Review  │  ← Check plan feasibility
└────┬─────┘
     │
     ▼
┌──────────┐
│ Execute  │  ← Implement step by step
└────┬─────┘
     │
     ▼
┌──────────┐
│  Verify  │  ← Confirm results
└────┬─────┘
     │
     ▼
  Result
```

**Best for:** Daily development, standard features

```bash
maw workflow plan "Implement user login"
maw workflow plan "Add database connection pool"
maw workflow plan "Refactor error handling"
```

---

### 4. TDD-Plan Mode - Test-Driven Development

```
User Task
    │
    ▼
┌────────────────┐
│ Write Tests    │  ← RED: Define expected behavior
│ (RED)          │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Run Tests      │  ← Confirm tests fail
│ (Confirm Fail) │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Implement      │  ← GREEN: Write minimal code to pass
│ (GREEN)        │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Refactor       │  ← REFACTOR: Optimize with test safety
│ (REFACTOR)     │
└───────┬────────┘
        │
        ▼
  Done (with tests)
```

**Best for:** Core business logic, APIs, critical features

```bash
maw workflow tdd-plan "Implement order calculation"
maw workflow tdd-plan "Add user permission validation"
maw workflow tdd-plan "Implement payment interface"
```

---

### 5. Brainstorm Mode - Multi-Role Ideation

```
User Topic
    │
    ▼
┌─────────────────────────────────────────┐
│           Multi-Role Discussion          │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Architect│  │Developer │  │  QA    │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │             │            │      │
│       └──────────┬──┴────────────┘      │
│                  │                      │
│                  ▼                      │
│         Discussion & Debate             │
└─────────────────────────────────────────┘
                   │
                   ▼
          ┌──────────────┐
          │  Conclusion  │
          │ Best Solution│
          └──────────────┘
```

**Best for:** Architecture decisions, technical choices, complex analysis

```bash
maw workflow brainstorm "API design approach"
maw workflow brainstorm "Database selection"
maw workflow brainstorm "Performance optimization strategy"
```

**Roles:**
| Role | Focus |
|------|-------|
| Architect | Overall design, scalability, tech debt |
| Developer | Implementation difficulty, efficiency, code quality |
| QA | Testability, edge cases, potential issues |

---

### 6. Five-Phase Mode - Professional Multi-AI Collaboration

```
User Task
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1: CONTEXT                           [Claude]     │
│ - Analyze project structure                             │
│ - Understand existing code                              │
│ - Gather relevant information                           │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: ANALYSIS                    [Codex + Gemini]   │
│                                                         │
│   ┌─────────────┐              ┌─────────────┐         │
│   │   Codex     │   Parallel   │   Gemini    │         │
│   │ Code-level  │◄────────────►│ Arch-level  │         │
│   │  Analysis   │              │  Analysis   │         │
│   └─────────────┘              └─────────────┘         │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3: PROTOTYPE                         [Claude]     │
│ - Synthesize analysis results                           │
│ - Design initial solution                               │
│ - Create code skeleton                                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 4: IMPLEMENT                         [Claude]     │
│ - Complete code implementation                          │
│ - Handle edge cases                                     │
│ - Add error handling                                    │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 5: AUDIT                   [Claude+Codex+Gemini]  │
│ - Code review                                           │
│ - Security check                                        │
│ - Final verification                                    │
└─────────────────────────────────────────────────────────┘
    │
    ▼
  Complete (High-quality, multi-AI verified)
```

**Best for:** Large features, system refactoring, critical modules

```bash
maw workflow five-phase "Implement complete payment system"
maw workflow five-phase "Refactor database access layer"
maw workflow five-phase "Implement OAuth2 authentication"
```

---

### 7. Ralph Loop Mode - Iterative AI Development

Ralph Loop is inspired by the "Ralph technique" - a continuous AI agent loop for iterative development until task completion.

```
                     ┌──────────────────────────────────────┐
                     │            RALPH LOOP                │
                     │   "Persistence Wins"                 │
                     └──────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    ┌──────────┐                                                     │
│    │  Prompt  │ ◄───────────────────────────────────┐               │
│    │ (Fixed)  │                                     │               │
│    └────┬─────┘                                     │               │
│         │                                           │               │
│         ▼                                           │               │
│    ┌──────────┐                                     │               │
│    │    AI    │  ← Claude/Codex/Gemini/Auto         │               │
│    │ Execute  │                                     │               │
│    └────┬─────┘                                     │               │
│         │                                           │               │
│         ▼                                           │               │
│    ┌──────────┐     No      ┌───────────────────┐  │               │
│    │ Complete?├────────────►│  Next Iteration   │──┘               │
│    │          │             │  (AI sees its     │                   │
│    └────┬─────┘             │   previous work)  │                   │
│         │ Yes               └───────────────────┘                   │
│         ▼                                                           │
│    ┌──────────┐                                                     │
│    │   Done   │  ← Completion Promise Found                         │
│    └──────────┘                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Best for:** Tasks with clear success criteria, iterative refinement, automated verification

```bash
# Basic usage
maw workflow ralph "Build a REST API for todos. Output <promise>COMPLETE</promise> when done."

# With options
maw workflow ralph "Implement user auth with tests" \
  --max-iterations 30 \
  --completion-promise "COMPLETE" \
  --ai auto \
  --verbose
```

**Key Concepts:**
| Concept | Description |
|---------|-------------|
| **Completion Promise** | A signal phrase that indicates task completion |
| **Iteration** | Each loop cycle where AI sees its previous work |
| **Persistence** | Keep trying until success (within max iterations) |
| **Self-Correction** | AI learns from its own failures in previous iterations |

**When to Use:**
- ✅ Tasks with clear, testable success criteria
- ✅ Tasks requiring iterative improvement
- ✅ Tasks with automatic verification (tests, linters)
- ❌ Tasks requiring human judgment
- ❌ Tasks with unclear completion criteria

---

## Mode Comparison

| Mode | Complexity | Time | AI Involved | Use Case |
|------|------------|------|-------------|----------|
| **Lite** | ⭐ | Shortest | Claude | Simple fixes |
| **Lite-Plan** | ⭐⭐ | Short | Claude | Medium tasks |
| **Plan** | ⭐⭐⭐ | Medium | Claude | Daily development |
| **TDD-Plan** | ⭐⭐⭐⭐ | Longer | Claude | Test-covered features |
| **Brainstorm** | ⭐⭐⭐ | Medium | Claude (multi-role) | Design decisions |
| **Five-Phase** | ⭐⭐⭐⭐⭐ | Longest | Claude+Codex+Gemini | Complex, high-quality |
| **Ralph Loop** | ⭐⭐⭐⭐ | Variable | Auto-selected | Iterative tasks |

### How to Choose?

```
                    What's your task?
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
     Simple fix?     Development?    Design decision?
          │               │               │
          ▼               │               ▼
        Lite             │          Brainstorm
                          │
               ┌──────────┴──────────┐
               │                     │
               ▼                     ▼
          Need tests?          Need multi-AI?
               │                     │
          ┌────┴────┐           ┌────┴────┐
          ▼         ▼           ▼         ▼
      TDD-Plan    Plan    Five-Phase   Plan
```

---

## Usage in Claude Code

### Slash Commands

MAW provides slash commands for Claude Code:

| Command | Description |
|---------|-------------|
| `/gemini <task>` | Delegate to Gemini |
| `/codex <task>` | Delegate to Codex |
| `/maw <command>` | Execute MAW command |
| `/report <topic>` | Generate report with diagrams |
| `/ralph-loop <prompt>` | Start iterative AI loop |

**Examples:**
```
/gemini Analyze the performance of this code
/codex Write unit tests for the auth module
/maw workflow plan "Implement caching layer"
/ralph-loop "Build REST API with tests. Output COMPLETE when done."
/report "System Architecture Overview"
```

### Natural Language

You can also use natural language with Claude:

| You Say | Claude Does |
|---------|-------------|
| "Let Gemini analyze this..." | Calls Gemini bridge |
| "Delegate to Codex..." | Calls Codex bridge |
| "Use MAW to..." | Starts MAW workflow |
| "Generate a report about..." | Runs report generator |

**Examples:**
```
"Let Gemini analyze this module's architecture"
"Delegate to Codex to write tests for this function"
"Use MAW five-phase workflow to refactor authentication"
"Generate a report about our API design with diagrams"
```

### Multi-AI Collaboration Triggers

```
"Use multiple AIs to collaborate on..."
"Let Claude plan and Codex execute..."
"Start five-phase collaboration workflow..."
```

---

## Report Generation

MAW can generate professional reports with auto-generated diagrams:

```bash
# Using slash command
/report "Machine Learning Pipeline Architecture"

# Using Python script directly
python ~/.maw/skills/report-generator/report_generator.py \
  --topic "System Design" \
  --content "Your research content..." \
  --output report.md
```

**Features:**
- Auto-analyzes content structure
- Identifies where diagrams would help
- Generates Mermaid diagrams (or images when available)
- Professional academic style output

---

## Architecture

```
Multi-AI-Workflow/
│
├── maw/                       # TypeScript CLI Core
│   ├── src/
│   │   ├── cli.ts            # Main CLI entry
│   │   ├── commands/         # Command implementations
│   │   │   ├── delegate.ts   # AI delegation + semantic routing
│   │   │   ├── workflow.ts   # Workflow execution
│   │   │   └── session.ts    # Session management
│   │   └── core/             # Core modules
│   │       ├── workflow-engine.ts   # 6-level workflows
│   │       ├── session-manager.ts
│   │       └── skill-registry.ts
│   └── bin/maw.js            # CLI executable
│
├── bridges/                   # Python AI Bridges
│   └── src/maw_bridges/
│       ├── codex_bridge.py   # Codex CLI wrapper
│       └── gemini_bridge.py  # Gemini CLI/API wrapper
│
├── dashboard/                 # Web Dashboard
│   ├── src/
│   │   ├── server.ts         # Express + WebSocket
│   │   ├── storage.ts        # SQLite database
│   │   └── maw-bridge.ts     # CLI data integration
│   └── public/               # Frontend SPA
│
└── .maw/                      # Configuration & Skills
    ├── config.json
    └── skills/               # Installed skills
```

---

## Configuration

MAW configuration is stored in `.maw/config.json`:

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

### Sandbox Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `read-only` | Cannot modify any files | Code analysis, auditing |
| `workspace-write` | Can modify project files | Daily development |
| `full-access` | Complete control | System-level operations |

---

## Commands Reference

### Workflow Commands

```bash
maw workflow lite <task>        # Instant execution
maw workflow lite-plan <task>   # Quick plan + execute
maw workflow plan <task>        # Standard planning
maw workflow tdd-plan <task>    # Test-driven development
maw workflow brainstorm <topic> # Multi-role ideation
maw workflow five-phase <task>  # 5-phase collaboration
maw workflow ralph <prompt>     # Iterative AI loop

# Ralph Loop options
maw workflow ralph "Build feature X" \
  --max-iterations 30 \
  --completion-promise "COMPLETE" \
  --ai auto \
  --verbose
```

### Delegation Commands

```bash
maw delegate codex <task> --cd .    # Delegate to Codex
maw delegate gemini <task>          # Delegate to Gemini
maw run <task>                      # Smart routing
```

### Session Commands

```bash
maw session list              # List all sessions
maw session new <name>        # Create new session
maw session resume <id>       # Resume session
maw session sync              # Sync across AIs
```

### Other Commands

```bash
maw view                      # Open dashboard
maw skill list                # List installed skills
maw skill install <source>    # Install skill
```

---

## Contributing

We welcome contributions! Please see our contributing guidelines.

```bash
# Fork the repository
git checkout -b feature/amazing-feature
git commit -m 'Add amazing feature'
git push origin feature/amazing-feature
# Open a Pull Request
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### Star us on GitHub!

If you find MAW useful, please consider giving us a star.

[![GitHub stars](https://img.shields.io/github/stars/haoyu-haoyu/Multi-AI-Workflow?style=social)](https://github.com/haoyu-haoyu/Multi-AI-Workflow)

---

**Built by [haoyu-haoyu](https://github.com/haoyu-haoyu)**

*Making AI collaboration accessible to everyone*

</div>
