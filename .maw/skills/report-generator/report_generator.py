"""
MAW Report Generator - Multi-AI Collaborative Report Generation

Workflow:
1. Claude: Analyze input, create report structure, write content
2. Gemini: Generate diagrams (image or Mermaid/SVG fallback)
3. Claude: Compile final report with all assets

Supports:
- Native image generation (when available)
- Mermaid diagrams (text-based, renders in Markdown)
- SVG diagrams (vector graphics)
- PlantUML diagrams
"""

import json
import os
import sys
import base64
import urllib.request
import urllib.error
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

# ============= Configuration =============
PROXY_BASE_URL = os.environ.get("GEMINI_PROXY_BASE_URL", "https://api.ikuncode.cc")
PROXY_API_KEY = os.environ.get("GEMINI_PROXY_API_KEY", "")
IMAGE_MODEL = "gemini-3-pro-preview"
TEXT_MODEL = "gemini-2.5-flash"


def call_gemini_api(prompt: str, model: str = TEXT_MODEL, response_modalities: List[str] = None) -> dict:
    """Call Gemini API with optional image generation."""
    if not PROXY_API_KEY:
        return {
            "success": False,
            "error": "GEMINI_PROXY_API_KEY environment variable is required. "
                     "Set it via: export GEMINI_PROXY_API_KEY='your-key-here'",
        }
    url = f"{PROXY_BASE_URL}/v1/models/{model}:generateContent"

    request_body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
        }
    }

    if response_modalities:
        request_body["generationConfig"]["responseModalities"] = response_modalities

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {PROXY_API_KEY}",
    }

    try:
        data = json.dumps(request_body).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')

        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode('utf-8'))

        if "candidates" in result and len(result["candidates"]) > 0:
            parts = result["candidates"][0].get("content", {}).get("parts", [])

            text_content = ""
            images = []

            for part in parts:
                if "text" in part:
                    text_content += part["text"]
                if "inlineData" in part:
                    images.append({
                        "mime_type": part["inlineData"].get("mimeType"),
                        "data": part["inlineData"].get("data"),
                    })

            return {
                "success": True,
                "text": text_content,
                "images": images,
            }
        else:
            return {"success": False, "error": result.get("error", {}).get("message", "Unknown error")}

    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_mermaid_diagram(description: str) -> dict:
    """Generate Mermaid diagram code from description using Gemini."""
    prompt = f"""Based on this description, generate a Mermaid diagram code.
Only output the Mermaid code block, no explanations.

Description: {description}

Example output format:
```mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
```
"""

    result = call_gemini_api(prompt, model=TEXT_MODEL)

    if result["success"]:
        text = result["text"]
        # Extract mermaid code
        if "```mermaid" in text:
            start = text.find("```mermaid")
            end = text.find("```", start + 10)
            if end > start:
                mermaid_code = text[start:end + 3]
                return {"success": True, "mermaid": mermaid_code}

        # If no mermaid block found, try to use the text as-is
        return {"success": True, "mermaid": f"```mermaid\n{text}\n```"}

    return result


def generate_image(description: str) -> dict:
    """Try to generate image, fallback to Mermaid if not available."""
    # First try native image generation
    result = call_gemini_api(
        f"Generate an image: {description}",
        model=IMAGE_MODEL,
        response_modalities=["TEXT", "IMAGE"]
    )

    if result["success"] and result.get("images"):
        # Save image to file
        image_data = result["images"][0]
        filename = f"report_image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

        with open(filename, "wb") as f:
            f.write(base64.b64decode(image_data["data"]))

        return {
            "success": True,
            "type": "image",
            "path": filename,
            "markdown": f"![{description}]({filename})"
        }

    # Fallback to Mermaid diagram
    print("[Info] Image generation not available, falling back to Mermaid diagram...")
    mermaid_result = generate_mermaid_diagram(description)

    if mermaid_result["success"]:
        return {
            "success": True,
            "type": "mermaid",
            "code": mermaid_result["mermaid"],
            "markdown": mermaid_result["mermaid"]
        }

    return {"success": False, "error": "Failed to generate both image and diagram"}


def analyze_content_for_diagrams(content: str) -> List[Dict[str, str]]:
    """Analyze content and suggest diagrams that would enhance it."""
    prompt = f"""Analyze the following content and suggest diagrams/figures that would enhance understanding.
For each suggestion, provide:
1. A title for the diagram
2. A detailed description of what the diagram should show
3. The type (flowchart, sequence, mindmap, architecture, chart)

Output as JSON array:
[
  {{"title": "...", "description": "...", "type": "..."}}
]

Content:
{content[:4000]}
"""

    result = call_gemini_api(prompt, model=TEXT_MODEL)

    if result["success"]:
        try:
            # Extract JSON from response
            text = result["text"]
            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except:
            pass

    return []


def generate_report_structure(topic: str, content: str) -> dict:
    """Generate report structure based on topic and content."""
    prompt = f"""Create a detailed report structure for the following topic and content.

Topic: {topic}

Content/Research:
{content[:6000]}

Generate a JSON structure with:
{{
  "title": "Report title",
  "abstract": "Brief summary",
  "sections": [
    {{
      "heading": "Section title",
      "content_points": ["point 1", "point 2"],
      "suggested_diagrams": ["diagram description 1"]
    }}
  ],
  "conclusion_points": ["key takeaway 1", "key takeaway 2"]
}}
"""

    result = call_gemini_api(prompt, model=TEXT_MODEL)

    if result["success"]:
        try:
            text = result["text"]
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return {"success": True, "structure": json.loads(text[start:end])}
        except Exception as e:
            return {"success": False, "error": f"Failed to parse structure: {e}"}

    return result


def write_section(heading: str, points: List[str], context: str) -> dict:
    """Write a detailed section based on points and context."""
    prompt = f"""Write a detailed section for a report.

Section Heading: {heading}

Key Points to Cover:
{json.dumps(points, indent=2)}

Context from Research:
{context[:3000]}

Write in academic/professional style. Be detailed and thorough.
Use proper formatting with subheadings if needed.
"""

    result = call_gemini_api(prompt, model=TEXT_MODEL)

    if result["success"]:
        return {"success": True, "content": result["text"]}

    return result


def generate_full_report(topic: str, research_content: str, output_file: str = "report.md") -> dict:
    """Generate a complete report with diagrams."""
    print(f"[MAW Report Generator] Starting report generation for: {topic}")

    # Step 1: Generate structure
    print("[Step 1/4] Analyzing content and generating structure...")
    structure_result = generate_report_structure(topic, research_content)

    if not structure_result["success"]:
        return {"success": False, "error": f"Failed to generate structure: {structure_result.get('error')}"}

    structure = structure_result["structure"]

    # Step 2: Identify diagrams needed
    print("[Step 2/4] Identifying diagrams...")
    all_diagrams = []
    for section in structure.get("sections", []):
        for diagram_desc in section.get("suggested_diagrams", []):
            all_diagrams.append({
                "section": section["heading"],
                "description": diagram_desc
            })

    # Step 3: Generate diagrams
    print(f"[Step 3/4] Generating {len(all_diagrams)} diagrams...")
    generated_diagrams = {}
    for i, diagram in enumerate(all_diagrams):
        print(f"  Generating diagram {i+1}/{len(all_diagrams)}: {diagram['description'][:50]}...")
        result = generate_image(diagram["description"])
        if result["success"]:
            generated_diagrams[diagram["description"]] = result

    # Step 4: Compile report
    print("[Step 4/4] Compiling report...")

    report_lines = [
        f"# {structure.get('title', topic)}",
        "",
        f"*Generated by MAW Report Generator on {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
        "",
        "---",
        "",
        "## Abstract",
        "",
        structure.get("abstract", ""),
        "",
        "---",
        "",
    ]

    # Write sections
    for section in structure.get("sections", []):
        report_lines.append(f"## {section['heading']}")
        report_lines.append("")

        # Write section content
        section_result = write_section(
            section["heading"],
            section.get("content_points", []),
            research_content
        )

        if section_result["success"]:
            report_lines.append(section_result["content"])
        else:
            for point in section.get("content_points", []):
                report_lines.append(f"- {point}")

        report_lines.append("")

        # Add diagrams for this section
        for diagram_desc in section.get("suggested_diagrams", []):
            if diagram_desc in generated_diagrams:
                diagram = generated_diagrams[diagram_desc]
                report_lines.append(f"### Figure: {diagram_desc}")
                report_lines.append("")
                report_lines.append(diagram["markdown"])
                report_lines.append("")

        report_lines.append("")

    # Conclusion
    report_lines.append("## Conclusion")
    report_lines.append("")
    for point in structure.get("conclusion_points", []):
        report_lines.append(f"- {point}")
    report_lines.append("")

    # Write to file
    report_content = "\n".join(report_lines)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"[Complete] Report saved to: {output_file}")

    return {
        "success": True,
        "output_file": output_file,
        "structure": structure,
        "diagrams_generated": len(generated_diagrams),
    }


def main():
    parser = argparse.ArgumentParser(description="MAW Report Generator")
    parser.add_argument("--topic", required=True, help="Report topic/title")
    parser.add_argument("--content", help="Research content (text)")
    parser.add_argument("--content-file", type=Path, help="File containing research content")
    parser.add_argument("--output", default="report.md", help="Output file path")
    parser.add_argument("--diagram-only", help="Generate only a diagram from description")

    args = parser.parse_args()

    # Diagram-only mode
    if args.diagram_only:
        result = generate_image(args.diagram_only)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    # Get content
    content = args.content or ""
    if args.content_file and args.content_file.exists():
        content = args.content_file.read_text(encoding="utf-8")

    if not content:
        print("Error: Please provide content via --content or --content-file")
        sys.exit(1)

    # Generate report
    result = generate_full_report(args.topic, content, args.output)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
