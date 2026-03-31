#!/usr/bin/env python3
"""
Gemini Bridge - Python wrapper for Gemini CLI

Based on GuDaStudio/skills collaborating-with-gemini implementation.
Provides JSON-based interface for Claude to delegate tasks to Gemini.

Usage:
    python gemini_bridge.py --PROMPT "task" --cd "/path" [options]

Returns JSON:
    {
        "success": true,
        "SESSION_ID": "uuid",
        "agent_messages": "response content"
    }
"""

import json
import os
import sys
import argparse
from pathlib import Path

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
    parser = argparse.ArgumentParser(description="Gemini Bridge - Delegate tasks to Gemini CLI")
    parser.add_argument(
        "--PROMPT",
        required=True,
        help="Instruction for the task to send to gemini."
    )
    parser.add_argument(
        "--cd",
        required=True,
        type=Path,
        help="Set the workspace root for gemini before executing the task."
    )
    parser.add_argument(
        "--sandbox",
        action="store_true",
        default=True,
        help="Run in sandbox mode (can only modify files in workspace). Defaults to True for safety."
    )
    parser.add_argument(
        "--SESSION_ID",
        default="",
        help="Resume the specified session of the gemini. Defaults to empty, start a new session."
    )
    parser.add_argument(
        "--return-all-messages",
        action="store_true",
        help="Return all messages from the gemini session."
    )
    parser.add_argument(
        "--model",
        default="",
        help="Model override. Only use when explicitly specified by user."
    )

    args = parser.parse_args()

    cd: Path = args.cd
    if not cd.exists():
        result = {
            "success": False,
            "error": f"The workspace root directory `{cd.absolute()}` does not exist."
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(1)

    PROMPT = args.PROMPT
    if os.name == "nt":
        PROMPT = windows_escape(PROMPT)

    # Build gemini command: gemini --prompt PROMPT -o stream-json [options]
    cmd = ["gemini", "--prompt", PROMPT, "-o", "stream-json"]

    if args.sandbox:
        cmd.append("--sandbox")

    if args.model:
        cmd.extend(["--model", args.model])

    if args.SESSION_ID:
        cmd.extend(["--resume", args.SESSION_ID])

    all_messages = []
    agent_messages = ""
    success = True
    err_message = ""
    thread_id = None

    # Deprecated prompt warning to filter out
    DEPRECATED_WARNING = "The --prompt (-p) flag has been deprecated and will be removed in a future version."

    for line in run_shell_command(cmd, cwd=str(cd.absolute())):
        try:
            line_dict = json.loads(line.strip())
            all_messages.append(line_dict)
            item_type = line_dict.get("type", "")
            item_role = line_dict.get("role", "")

            if item_type == "message" and item_role == "assistant":
                content = line_dict.get("content", "")
                # Filter out deprecated warning
                if DEPRECATED_WARNING in content:
                    continue
                agent_messages = agent_messages + content

            if line_dict.get("session_id") is not None:
                thread_id = line_dict.get("session_id")

        except json.JSONDecodeError:
            err_message += "\n\n[json decode error] " + line
            continue
        except Exception as error:
            err_message += f"\n\n[unexpected error] {error}. Line: {line!r}"
            break

    result = {}

    if thread_id is None:
        success = False
        err_message = "Failed to get `SESSION_ID` from the gemini session.\n\n" + err_message
    else:
        result["SESSION_ID"] = thread_id

    if success and len(agent_messages) == 0:
        success = False
        err_message = (
            "Failed to retrieve `agent_messages` from the Gemini session. "
            "This might be due to Gemini performing a tool call. "
            "You can continue using the `SESSION_ID` to proceed.\n\n" + err_message
        )

    if success:
        result["agent_messages"] = agent_messages
    else:
        result["error"] = err_message

    result["success"] = success

    if args.return_all_messages:
        result["all_messages"] = all_messages

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
