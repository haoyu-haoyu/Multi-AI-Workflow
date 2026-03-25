#!/usr/bin/env python3
"""
Codex Bridge - Python wrapper for Codex CLI

Based on GuDaStudio/skills collaborating-with-codex implementation.
Provides JSON-based interface for Claude to delegate tasks to Codex.

Usage:
    python codex_bridge.py --PROMPT "task" --cd "/path" [options]

Returns JSON:
    {
        "success": true,
        "SESSION_ID": "uuid",
        "agent_messages": "response content"
    }
"""
from __future__ import annotations

import json
import re
import os
import sys
import argparse
from pathlib import Path
from typing import List, Optional

try:
    from maw_bridges.shell_utils import run_shell_command, configure_windows_stdio
except ImportError:
    from shell_utils import run_shell_command, configure_windows_stdio  # type: ignore[import-not-found]


def windows_escape(prompt: str) -> str:
    """Windows style string escaping for newlines and special chars in prompt text."""
    result = prompt.replace('\n', '\\n')
    result = result.replace('\r', '\\r')
    result = result.replace('\t', '\\t')
    return result


def main():
    configure_windows_stdio()
    parser = argparse.ArgumentParser(description="Codex Bridge - Delegate tasks to Codex CLI")
    parser.add_argument(
        "--PROMPT",
        required=True,
        help="Instruction for the task to send to codex."
    )
    parser.add_argument(
        "--cd",
        required=True,
        help="Set the workspace root for codex before executing the task."
    )
    parser.add_argument(
        "--sandbox",
        default="workspace-write",
        choices=["read-only", "workspace-write", "danger-full-access"],
        help="Sandbox policy for model-generated commands. Defaults to `workspace-write` (can only modify files in workspace)."
    )
    parser.add_argument(
        "--SESSION_ID",
        default="",
        help="Resume the specified session of the codex. Defaults to empty, start a new session."
    )
    parser.add_argument(
        "--skip-git-repo-check",
        action="store_true",
        default=True,
        help="Allow codex running outside a Git repository."
    )
    parser.add_argument(
        "--return-all-messages",
        action="store_true",
        help="Return all messages from the codex session."
    )
    parser.add_argument(
        "--image",
        action="append",
        default=[],
        help="Attach image files to the prompt. Can be repeated."
    )
    parser.add_argument(
        "--model",
        default="",
        help="Model override. Only use when explicitly specified by user."
    )
    parser.add_argument(
        "--yolo",
        action="store_true",
        help="Run without approvals or sandboxing."
    )
    parser.add_argument(
        "--profile",
        default="",
        help="Configuration profile name."
    )

    args = parser.parse_args()

    # Validate working directory
    cd_path = Path(args.cd)
    if not cd_path.exists():
        result = {
            "success": False,
            "error": f"Directory not found: {cd_path.absolute()}"
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(1)

    # Build codex command using the correct syntax: codex exec --sandbox X --cd Y --json [resume SESSION_ID] -- PROMPT
    cmd = ["codex", "exec", "--sandbox", args.sandbox, "--cd", str(cd_path.absolute()), "--json"]

    if args.image:
        cmd.extend(["--image", ",".join(args.image)])

    if args.model:
        cmd.extend(["--model", args.model])

    if args.profile:
        cmd.extend(["--profile", args.profile])

    if args.yolo:
        cmd.append("--yolo")

    if args.skip_git_repo_check:
        cmd.append("--skip-git-repo-check")

    if args.SESSION_ID:
        cmd.extend(["resume", args.SESSION_ID])

    PROMPT = args.PROMPT
    if os.name == "nt":
        PROMPT = windows_escape(PROMPT)

    cmd += ["--", PROMPT]

    # Execute and parse output
    all_messages: List[dict] = []
    agent_messages = ""
    success = True
    err_message = ""
    thread_id: Optional[str] = None

    for line in run_shell_command(cmd, cwd=str(cd_path.absolute())):
        try:
            line_dict = json.loads(line.strip())
            all_messages.append(line_dict)
            item = line_dict.get("item", {})
            item_type = item.get("type", "")

            if item_type == "agent_message":
                agent_messages = agent_messages + item.get("text", "")

            if line_dict.get("thread_id") is not None:
                thread_id = line_dict.get("thread_id")

            if "fail" in line_dict.get("type", ""):
                success = False if len(agent_messages) == 0 else success
                err_message += "\n\n[codex error] " + line_dict.get("error", {}).get("message", "")

            if "error" in line_dict.get("type", ""):
                error_msg = line_dict.get("message", "")
                # Ignore reconnection messages
                is_reconnecting = bool(re.match(r'^Reconnecting\.\.\.\s+\d+/\d+$', error_msg))
                if not is_reconnecting:
                    success = False if len(agent_messages) == 0 else success
                    err_message += "\n\n[codex error] " + error_msg

        except json.JSONDecodeError:
            err_message += "\n\n[json decode error] " + line
            continue
        except Exception as error:
            err_message += f"\n\n[unexpected error] {error}. Line: {line!r}"
            success = False
            break

    if thread_id is None:
        success = False
        err_message = "Failed to get `SESSION_ID` from the codex session.\n\n" + err_message

    if len(agent_messages) == 0:
        success = False
        err_message = "Failed to get `agent_messages` from the codex session. Try setting `return_all_messages` to True.\n\n" + err_message

    if success:
        result = {
            "success": True,
            "SESSION_ID": thread_id,
            "agent_messages": agent_messages,
        }
    else:
        result = {"success": False, "error": err_message}

    if args.return_all_messages:
        result["all_messages"] = all_messages

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
