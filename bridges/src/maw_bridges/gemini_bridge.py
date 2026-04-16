#!/usr/bin/env python3
"""
Gemini Bridge - Python wrapper for Gemini CLI

Based on GuDaStudio/skills collaborating-with-gemini implementation.
Provides JSON-based interface for Claude to delegate tasks to Gemini.

Usage:
    python gemini_bridge.py --PROMPT "task" --cd "/path" [options]
    python gemini_bridge.py --daemon  # long-running stdin/stdout JSON-RPC mode

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


def execute_gemini_request(request: dict) -> dict:
    """Core execution logic — takes a request dict, returns a result dict.

    Expected request keys:
        prompt (str, required), cd (str, required),
        sandbox (bool), session_id (str), return_all_messages (bool), model (str)
    """
    prompt = request.get("prompt", "")
    cd = request.get("cd", "")
    if not prompt or not cd:
        return {"success": False, "error": "Missing required fields: prompt, cd"}

    cd_path = Path(cd)
    if not cd_path.exists():
        return {"success": False, "error": f"The workspace root directory `{cd_path.absolute()}` does not exist."}

    sandbox = request.get("sandbox", True)
    session_id = request.get("session_id", "")
    return_all = request.get("return_all_messages", False)
    model = request.get("model", "")

    PROMPT = prompt
    if os.name == "nt":
        PROMPT = windows_escape(PROMPT)

    cmd = ["gemini", "--prompt", PROMPT, "-o", "stream-json"]

    if sandbox:
        cmd.append("--sandbox")
    if model:
        cmd.extend(["--model", model])
    if session_id:
        cmd.extend(["--resume", session_id])

    all_messages = []
    agent_messages = ""
    success = True
    err_message = ""
    thread_id = None

    DEPRECATED_WARNING = "The --prompt (-p) flag has been deprecated and will be removed in a future version."

    for line in run_shell_command(cmd, cwd=str(cd_path.absolute())):
        try:
            line_dict = json.loads(line.strip())
            all_messages.append(line_dict)
            item_type = line_dict.get("type", "")
            item_role = line_dict.get("role", "")

            if item_type == "message" and item_role == "assistant":
                content = line_dict.get("content", "")
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

    result: dict = {}

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

    if return_all:
        result["all_messages"] = all_messages

    return result


def run_daemon() -> None:
    """Long-running daemon mode: read JSON requests from stdin, write responses to stdout."""
    sys.stderr.write("[gemini-bridge] daemon mode started, reading from stdin\n")
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
            response = execute_gemini_request(request)
        except Exception as e:
            response = {"success": False, "error": f"Unexpected error: {e}"}

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main():
    configure_windows_stdio()

    if "--daemon" in sys.argv:
        run_daemon()
        return

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
        help="Run in sandbox mode."
    )
    parser.add_argument(
        "--SESSION_ID",
        default="",
        help="Resume the specified session of the gemini."
    )
    parser.add_argument(
        "--return-all-messages",
        action="store_true",
        help="Return all messages from the gemini session."
    )
    parser.add_argument(
        "--model",
        default="",
        help="Model override."
    )

    args = parser.parse_args()

    result = execute_gemini_request({
        "prompt": args.PROMPT,
        "cd": str(args.cd),
        "sandbox": args.sandbox,
        "session_id": args.SESSION_ID,
        "return_all_messages": args.return_all_messages,
        "model": args.model,
    })

    print(json.dumps(result, indent=2, ensure_ascii=False))
    if not result.get("success"):
        sys.exit(1)


if __name__ == "__main__":
    main()
