#!/usr/bin/env python3
"""
Codex Bridge - Python wrapper for Codex CLI

Based on GuDaStudio/skills collaborating-with-codex implementation.
Provides JSON-based interface for Claude to delegate tasks to Codex.

Usage:
    python codex_bridge.py --PROMPT "task" --cd "/path" [options]
    python codex_bridge.py --daemon  # long-running stdin/stdout JSON-RPC mode

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


def execute_codex_request(request: dict) -> dict:
    """Core execution logic — takes a request dict, returns a result dict.

    Expected request keys:
        prompt (str, required), cd (str, required),
        sandbox (str), session_id (str), skip_git_repo_check (bool),
        return_all_messages (bool), image (list[str]), model (str),
        yolo (bool), profile (str)
    """
    prompt = request.get("prompt", "")
    cd = request.get("cd", "")
    if not prompt or not cd:
        return {"success": False, "error": "Missing required fields: prompt, cd"}

    cd_path = Path(cd)
    if not cd_path.exists():
        return {"success": False, "error": f"Directory not found: {cd_path.absolute()}"}

    sandbox = request.get("sandbox", "workspace-write")
    session_id = request.get("session_id", "")
    skip_git = request.get("skip_git_repo_check", True)
    return_all = request.get("return_all_messages", False)
    images: List[str] = request.get("image", [])
    model = request.get("model", "")
    yolo = request.get("yolo", False)
    profile = request.get("profile", "")

    cmd = ["codex", "exec", "--sandbox", sandbox, "--cd", str(cd_path.absolute()), "--json"]

    if images:
        cmd.extend(["--image", ",".join(images)])
    if model:
        cmd.extend(["--model", model])
    if profile:
        cmd.extend(["--profile", profile])
    if yolo:
        cmd.append("--yolo")
    if skip_git:
        cmd.append("--skip-git-repo-check")
    if session_id:
        cmd.extend(["resume", session_id])

    PROMPT = prompt
    if os.name == "nt":
        PROMPT = windows_escape(PROMPT)
    cmd += ["--", PROMPT]

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
        result: dict = {
            "success": True,
            "SESSION_ID": thread_id,
            "agent_messages": agent_messages,
        }
    else:
        result = {"success": False, "error": err_message}

    if return_all:
        result["all_messages"] = all_messages

    return result


def run_daemon() -> None:
    """Long-running daemon mode: read JSON requests from stdin, write responses to stdout.

    Each request is one JSON object per line. Each response is one JSON object per line.
    The daemon exits when stdin is closed (EOF).
    """
    sys.stderr.write("[codex-bridge] daemon mode started, reading from stdin\n")
    sys.stderr.flush()

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            request = json.loads(raw_line)
        except json.JSONDecodeError as e:
            response = {"success": False, "error": f"Invalid JSON request: {e}"}
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue

        try:
            response = execute_codex_request(request)
        except Exception as e:
            response = {"success": False, "error": f"Unexpected error: {e}"}

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main():
    configure_windows_stdio()

    if "--daemon" in sys.argv:
        run_daemon()
        return

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
        help="Sandbox policy for model-generated commands."
    )
    parser.add_argument(
        "--SESSION_ID",
        default="",
        help="Resume the specified session of the codex."
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
        help="Model override."
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

    result = execute_codex_request({
        "prompt": args.PROMPT,
        "cd": args.cd,
        "sandbox": args.sandbox,
        "session_id": args.SESSION_ID,
        "skip_git_repo_check": args.skip_git_repo_check,
        "return_all_messages": args.return_all_messages,
        "image": args.image,
        "model": args.model,
        "yolo": args.yolo,
        "profile": args.profile,
    })

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if not result.get("success"):
        sys.exit(1)


if __name__ == "__main__":
    main()
