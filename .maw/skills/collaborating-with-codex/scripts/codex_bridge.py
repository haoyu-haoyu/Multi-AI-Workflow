"""
Codex Bridge Script for Claude Agent Skills.
Thin wrapper that delegates to the shared bridges package.
"""
from __future__ import annotations

import sys
import os
from pathlib import Path

# Add the bridges package to the Python path so we can import from it.
# Resolve relative to this script: ../../../../bridges/src
_BRIDGES_SRC = str(Path(__file__).resolve().parents[3] / "bridges" / "src")
if _BRIDGES_SRC not in sys.path:
    sys.path.insert(0, _BRIDGES_SRC)

# Re-export the canonical bridge entry point
from maw_bridges.codex_bridge import main  # noqa: E402

if __name__ == "__main__":
    main()
