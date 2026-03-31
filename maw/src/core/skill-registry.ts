/**
 * Skill Registry
 *
 * Manages skill discovery, registration, and lifecycle.
 * Supports built-in skills, AI bridge skills (from GuDaStudio/skills),
 * and custom user skills.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, cpSync, realpathSync, lstatSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

export type SkillType = 'built-in' | 'ai-bridge' | 'custom';
export type SkillRuntime = 'typescript' | 'python' | 'shell';

export interface SkillBridgeConfig {
  /** Target AI model */
  targetAI: 'codex' | 'gemini' | 'qwen' | 'deepseek' | string;
  /** Path to bridge script */
  scriptPath: string;
  /** Whether skill supports SESSION_ID for multi-turn */
  supportsSession: boolean;
}

export interface SkillRuntimeConfig {
  language: SkillRuntime;
  entryPoint: string;
  dependencies?: string[];
}

export interface SkillSecurityConfig {
  defaultSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  requiredPermissions: string[];
}

export interface SkillManifest {
  /** Unique skill name */
  name: string;
  /** Skill version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Skill type */
  type: SkillType;
  /** Path to skill directory */
  path: string;
  /** AI bridge configuration (for ai-bridge type) */
  bridge?: SkillBridgeConfig;
  /** Runtime configuration */
  runtime: SkillRuntimeConfig;
  /** Security configuration */
  security: SkillSecurityConfig;
  /** Triggers/keywords that activate this skill */
  triggers?: string[];
  /** Whether skill is currently enabled */
  enabled: boolean;
}

export interface SkillInstallOptions {
  /** Installation scope */
  scope: 'user' | 'project';
  /** Specific skills to install (if source has multiple) */
  skills?: string[];
  /** Custom installation path */
  targetPath?: string;
}

export function validatePathWithinBase(targetPath: string, baseDir: string): void {
  const realBase = resolve(baseDir);
  const realTarget = resolve(targetPath);
  const rel = relative(realBase, realTarget);
  if (rel.startsWith('..') || resolve(realBase, rel) !== realTarget) {
    throw new Error(`Path traversal rejected: ${targetPath} escapes ${baseDir}`);
  }
}

/**
 * Skill Registry - Handles skill discovery and management
 */
export class SkillRegistry {
  private skills: Map<string, SkillManifest> = new Map();
  private searchPaths: string[];
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.searchPaths = [
      join(projectRoot, '.maw', 'skills'),           // Project level
      join(process.env.HOME || homedir(), '.maw', 'skills'), // User level
    ];
  }

  /**
   * Discover and register all available skills
   */
  async discover(): Promise<void> {
    this.skills.clear();

    for (const searchPath of this.searchPaths) {
      if (existsSync(searchPath)) {
        await this.scanDirectory(searchPath);
      }
    }
  }

  /**
   * Scan directory for skills
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        const skillPath = join(dirPath, entry.name);
        const manifest = await this.loadSkillManifest(skillPath, entry.name);
        if (manifest) {
          this.register(manifest);
        }
      }
    }
  }

  /**
   * Load skill manifest from directory
   */
  private async loadSkillManifest(
    skillPath: string,
    name: string
  ): Promise<SkillManifest | null> {
    // Try to load skill.md (following skills project pattern)
    const skillMdPath = join(skillPath, 'SKILL.md');
    const skillJsonPath = join(skillPath, 'skill.json');

    let manifest: Partial<SkillManifest> = {
      name,
      path: skillPath,
      enabled: true,
    };

    // Load from skill.json if exists
    if (existsSync(skillJsonPath)) {
      try {
        const json = JSON.parse(readFileSync(skillJsonPath, 'utf-8'));
        manifest = { ...manifest, ...json };
      } catch {
        // Continue with defaults
      }
    }

    // Parse SKILL.md for additional info
    if (existsSync(skillMdPath)) {
      const skillMd = readFileSync(skillMdPath, 'utf-8');
      manifest = {
        ...manifest,
        ...this.parseSkillMd(skillMd),
      };
    }

    // Detect skill type
    manifest.type = this.detectSkillType(skillPath);

    // Set defaults
    manifest.version = manifest.version || '1.0.0';
    manifest.description = manifest.description || `Skill: ${name}`;
    manifest.runtime = manifest.runtime || {
      language: this.detectRuntime(skillPath),
      entryPoint: this.detectEntryPoint(skillPath),
    };
    manifest.security = manifest.security || {
      defaultSandbox: 'read-only',
      requiredPermissions: [],
    };

    // Configure bridge if AI bridge skill
    if (manifest.type === 'ai-bridge') {
      manifest.bridge = this.detectBridgeConfig(skillPath, name);
    }

    return manifest as SkillManifest;
  }

  /**
   * Parse SKILL.md file (GuDaStudio/skills format)
   */
  private parseSkillMd(content: string): Partial<SkillManifest> {
    const result: Partial<SkillManifest> = {};

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      result.description = titleMatch[1];
    }

    // Extract triggers/keywords
    const triggerSection = content.match(/##\s*Triggers?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (triggerSection) {
      const triggers = triggerSection[1].match(/[-*]\s+(.+)/g);
      if (triggers) {
        result.triggers = triggers.map(t => t.replace(/^[-*]\s+/, '').trim());
      }
    }

    return result;
  }

  /**
   * Detect skill type based on contents
   */
  private detectSkillType(skillPath: string): SkillType {
    // Check for bridge scripts (AI bridge skill)
    const scriptsPath = join(skillPath, 'scripts');
    if (existsSync(scriptsPath)) {
      const scripts = readdirSync(scriptsPath);
      if (scripts.some(s => s.includes('_bridge.py'))) {
        return 'ai-bridge';
      }
    }

    // Check for built-in marker
    const packageJson = join(skillPath, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        if (pkg.maw?.type === 'built-in') {
          return 'built-in';
        }
      } catch {
        // Continue
      }
    }

    return 'custom';
  }

  /**
   * Detect runtime language
   */
  private detectRuntime(skillPath: string): SkillRuntime {
    const scriptsPath = join(skillPath, 'scripts');
    if (existsSync(scriptsPath)) {
      const scripts = readdirSync(scriptsPath);
      if (scripts.some(s => s.endsWith('.py'))) {
        return 'python';
      }
      if (scripts.some(s => s.endsWith('.sh'))) {
        return 'shell';
      }
    }

    if (existsSync(join(skillPath, 'index.ts')) || existsSync(join(skillPath, 'index.js'))) {
      return 'typescript';
    }

    return 'python'; // Default for AI bridge skills
  }

  /**
   * Detect entry point
   */
  private detectEntryPoint(skillPath: string): string {
    const scriptsPath = join(skillPath, 'scripts');
    if (existsSync(scriptsPath)) {
      const scripts = readdirSync(scriptsPath);
      const bridge = scripts.find(s => s.includes('_bridge.py'));
      if (bridge) {
        return join('scripts', bridge);
      }
    }

    if (existsSync(join(skillPath, 'index.ts'))) {
      return 'index.ts';
    }
    if (existsSync(join(skillPath, 'index.js'))) {
      return 'index.js';
    }

    return 'main.py';
  }

  /**
   * Detect bridge configuration for AI bridge skills
   */
  private detectBridgeConfig(skillPath: string, name: string): SkillBridgeConfig {
    // Determine target AI from skill name
    let targetAI = 'unknown';
    if (name.includes('codex')) {
      targetAI = 'codex';
    } else if (name.includes('gemini')) {
      targetAI = 'gemini';
    } else if (name.includes('qwen')) {
      targetAI = 'qwen';
    }

    // Find bridge script
    const scriptsPath = join(skillPath, 'scripts');
    let scriptPath = '';
    if (existsSync(scriptsPath)) {
      const scripts = readdirSync(scriptsPath);
      const bridge = scripts.find(s => s.includes('_bridge.py'));
      if (bridge) {
        scriptPath = join(scriptsPath, bridge);
      }
    }

    return {
      targetAI,
      scriptPath,
      supportsSession: true, // Skills project supports SESSION_ID
    };
  }

  /**
   * Register a skill
   */
  register(manifest: SkillManifest): void {
    this.skills.set(manifest.name, manifest);
  }

  /**
   * Unregister a skill
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): SkillManifest | undefined {
    return this.skills.get(name);
  }

  /**
   * List all skills
   */
  listSkills(): SkillManifest[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get AI bridge skills
   */
  getAIBridgeSkills(): SkillManifest[] {
    return this.listSkills().filter(s => s.type === 'ai-bridge');
  }

  /**
   * Get skill for specific AI
   */
  getSkillForAI(aiType: string): SkillManifest | undefined {
    return this.getAIBridgeSkills().find(s => s.bridge?.targetAI === aiType);
  }

  /**
   * Install skill from source
   */
  async install(source: string, options: SkillInstallOptions): Promise<void> {
    // Determine target path
    const targetBase = options.targetPath ||
      (options.scope === 'user'
        ? join(process.env.HOME || homedir(), '.maw', 'skills')
        : join(this.projectRoot, '.maw', 'skills'));

    // Ensure target directory exists
    if (!existsSync(targetBase)) {
      mkdirSync(targetBase, { recursive: true });
    }

    // If source is a local path
    if (existsSync(source)) {
      const skillName = source.split('/').pop() || 'skill';
      const targetPath = join(targetBase, skillName);

      // Remove existing installation
      if (existsSync(targetPath)) {
        const { rmSync } = await import('fs');
        rmSync(targetPath, { recursive: true });
      }

      // Validate paths before copying
      validatePathWithinBase(targetPath, targetBase);
      const sourceStat = lstatSync(source);
      if (sourceStat.isSymbolicLink()) {
        throw new Error(`Refusing to install from symlink source: ${source}`);
      }

      // Copy skill
      cpSync(source, targetPath, { recursive: true });

      // Re-discover skills
      await this.discover();
    }
    // TODO: Handle Git URLs and npm packages
  }

  /**
   * Enable/disable skill
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const skill = this.skills.get(name);
    if (skill) {
      skill.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Create new skill from template
   */
  async createFromTemplate(name: string, type: SkillType = 'custom'): Promise<string> {
    const targetPath = join(this.projectRoot, '.maw', 'skills', name);

    if (existsSync(targetPath)) {
      throw new Error(`Skill already exists: ${name}`);
    }

    mkdirSync(targetPath, { recursive: true });

    // Create SKILL.md
    const skillMd = `# ${name}

## Description
Custom skill for Multi-AI Workflow.

## Triggers
- When user requests "${name}" functionality
- Keywords: ${name}

## Usage
\`\`\`bash
maw skill run ${name} --args "..."
\`\`\`

## Configuration
\`\`\`json
{
  "option1": "default"
}
\`\`\`
`;
    const { writeFileSync } = await import('fs');
    writeFileSync(join(targetPath, 'SKILL.md'), skillMd);

    // Create skill.json
    const skillJson = {
      name,
      version: '1.0.0',
      description: `Custom skill: ${name}`,
      type,
      runtime: {
        language: 'python',
        entryPoint: 'scripts/main.py',
      },
      security: {
        defaultSandbox: 'read-only',
        requiredPermissions: [],
      },
    };
    writeFileSync(join(targetPath, 'skill.json'), JSON.stringify(skillJson, null, 2));

    // Create scripts directory
    const scriptsPath = join(targetPath, 'scripts');
    mkdirSync(scriptsPath, { recursive: true });

    // Create main.py
    const mainPy = `#!/usr/bin/env python3
"""
${name} - Custom skill for Multi-AI Workflow
"""

import argparse
import json
import sys

def main():
    parser = argparse.ArgumentParser(description="${name} skill")
    parser.add_argument("--prompt", required=True, help="Task prompt")
    parser.add_argument("--cd", default=".", help="Working directory")
    args = parser.parse_args()

    # Implement skill logic here
    result = {
        "success": True,
        "content": f"Processed: {args.prompt}",
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
    writeFileSync(join(scriptsPath, 'main.py'), mainPy);

    // Re-discover skills
    await this.discover();

    return targetPath;
  }
}

export default SkillRegistry;
