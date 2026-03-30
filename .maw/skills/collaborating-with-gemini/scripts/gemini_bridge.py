"""
Gemini Bridge Script for Claude Agent Skills.
Supports both native Gemini CLI (via shared bridges package) and proxy API.
"""

import json
import os
import sys
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

# Add the bridges package to the Python path
_BRIDGES_SRC = str(Path(__file__).resolve().parents[3] / "bridges" / "src")
if _BRIDGES_SRC not in sys.path:
    sys.path.insert(0, _BRIDGES_SRC)

from maw_bridges.gemini_bridge import main as native_main  # noqa: E402

# ============= Proxy API Configuration =============
PROXY_BASE_URL = os.environ.get("GEMINI_PROXY_BASE_URL", "https://api.ikuncode.cc")
PROXY_API_KEY = os.environ.get("GEMINI_PROXY_API_KEY", "")
DEFAULT_MODEL = os.environ.get("GEMINI_PROXY_MODEL", "gemini-2.5-flash")
USE_PROXY_API = os.environ.get("GEMINI_USE_PROXY", "true").lower() == "true"


def call_gemini_proxy_api(
    prompt: str,
    model: str = DEFAULT_MODEL,
    cwd: str = ".",
    session_id: Optional[str] = None,
) -> dict:
    """Call Gemini proxy API using native Gemini format."""

    if not PROXY_API_KEY:
        return {
            "success": False,
            "error": "GEMINI_PROXY_API_KEY environment variable is required for proxy mode. "
                     "Set it via: export GEMINI_PROXY_API_KEY='your-key-here' "
                     "Or use --use-native to use the native Gemini CLI instead.",
        }

    url = f"{PROXY_BASE_URL}/v1/models/{model}:generateContent"
    system_instruction = f"You are a helpful AI assistant. Current working directory: {cwd}"

    request_body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192},
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {PROXY_API_KEY}",
    }

    try:
        data = json.dumps(request_body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))

        if "candidates" in result and len(result["candidates"]) > 0:
            parts = result["candidates"][0].get("content", {}).get("parts", [])
            text_response = "".join(part.get("text", "") for part in parts)
            usage = result.get("usageMetadata", {})
            new_session_id = session_id or result.get("responseId") or f"gemini-{os.urandom(8).hex()}"

            return {
                "success": True,
                "SESSION_ID": new_session_id,
                "agent_messages": text_response,
                "model": result.get("modelVersion", model),
                "usage": {
                    "prompt_tokens": usage.get("promptTokenCount", 0),
                    "completion_tokens": usage.get("candidatesTokenCount", 0),
                    "total_tokens": usage.get("totalTokenCount", 0),
                },
            }
        else:
            error_msg = result.get("error", {}).get("message", "Unknown error")
            return {"success": False, "error": f"No response from API: {error_msg}"}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else str(e)
        try:
            error_msg = json.loads(error_body).get("error", {}).get("message", error_body)
        except (json.JSONDecodeError, AttributeError):
            error_msg = error_body
        return {"success": False, "error": f"HTTP Error {e.code}: {error_msg}"}
    except urllib.error.URLError as e:
        return {"success": False, "error": f"Connection Error: {e.reason}"}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON Decode Error: {e}"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {e}"}


def main():
    parser = argparse.ArgumentParser(description="Gemini Bridge - Supports proxy API and native CLI")
    parser.add_argument("--PROMPT", required=True, help="Instruction for the task to send to gemini.")
    parser.add_argument("--cd", required=True, type=Path, help="Set the workspace root for gemini.")
    parser.add_argument("--sandbox", action="store_true", default=True)
    parser.add_argument("--SESSION_ID", default="")
    parser.add_argument("--return-all-messages", action="store_true")
    parser.add_argument("--model", default="")
    parser.add_argument("--use-proxy", action="store_true", default=USE_PROXY_API)
    parser.add_argument("--use-native", action="store_true", default=False)

    args = parser.parse_args()

    cd: Path = args.cd
    if not cd.exists():
        print(json.dumps({"success": False, "error": f"Directory `{cd.absolute()}` does not exist."}, indent=2))
        return

    use_proxy = args.use_proxy and not args.use_native

    if use_proxy:
        model = args.model if args.model else DEFAULT_MODEL
        result = call_gemini_proxy_api(
            prompt=args.PROMPT,
            model=model,
            cwd=str(cd.absolute()),
            session_id=args.SESSION_ID if args.SESSION_ID else None,
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        # Delegate to the shared native bridge
        native_main()


if __name__ == "__main__":
    main()
