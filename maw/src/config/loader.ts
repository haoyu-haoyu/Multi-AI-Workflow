/**
 * Configuration Loader
 *
 * Handles multi-level configuration with environment variable support.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';

// Configuration schema using Zod
const AIConfigSchema = z.object({
  enabled: z.boolean().default(true),
  cliPath: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  timeout: z.number().optional(),
});

const WorkflowConfigSchema = z.object({
  defaultLevel: z.enum(['lite', 'lite-plan', 'plan', 'tdd-plan', 'brainstorm', 'delegate', 'collaborate']).default('plan'),
  parallelExecution: z.boolean().default(true),
  maxConcurrency: z.number().default(2),
  stateDir: z.string().default('.task'),
  sessionDir: z.string().default('.workflow'),
});

const SkillsConfigSchema = z.object({
  searchPaths: z.array(z.string()).default(['./.maw/skills', '~/.maw/skills']),
  autoDiscover: z.boolean().default(true),
  enabledSkills: z.array(z.string()).default([]),
});

const SecurityConfigSchema = z.object({
  defaultSandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
  secretsFile: z.string().optional(),
  allowedDomains: z.array(z.string()).optional(),
  maxExecutionTime: z.number().default(300000),
});

const CodexLensConfigSchema = z.object({
  enabled: z.boolean().default(true),
  indexPath: z.string().default('.maw/index'),
  embeddingModel: z.string().default('text-embedding-3-small'),
  searchMode: z.enum(['fulltext', 'semantic', 'hybrid']).default('hybrid'),
});

const DashboardConfigSchema = z.object({
  port: z.number().default(3000),
  autoOpen: z.boolean().default(true),
});

const TeamConfigSchema = z.object({
  enabled: z.boolean().default(false),
  serverUrl: z.string().optional(),
  syncMode: z.enum(['realtime', 'manual']).optional(),
}).optional();

const MAWConfigSchema = z.object({
  version: z.string().default('0.1.0'),
  ai: z.object({
    claude: AIConfigSchema.default({}),
    codex: AIConfigSchema.default({}),
    gemini: AIConfigSchema.default({}),
    litellm: AIConfigSchema.extend({
      configPath: z.string().optional(),
      models: z.array(z.object({
        name: z.string(),
        provider: z.string(),
        model: z.string(),
      })).optional(),
    }).default({}),
  }).default({}),
  workflow: WorkflowConfigSchema.default({}),
  skills: SkillsConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  codexLens: CodexLensConfigSchema.default({}),
  dashboard: DashboardConfigSchema.default({}),
  team: TeamConfigSchema,
});

export type MAWConfig = z.infer<typeof MAWConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;

interface ConfigCacheEntry { config: MAWConfig; timestamp: number; }
const configCache = new Map<string, ConfigCacheEntry>();
const CONFIG_CACHE_TTL_MS = 5_000;

/**
 * Configuration search order (priority: high to low)
 */
const CONFIG_SEARCH_ORDER = [
  './.maw/config.local.json',  // Project local override
  './.maw/config.json',        // Project config
];

const USER_CONFIG_PATHS = [
  '~/.maw/config.local.json',  // User local override
  '~/.maw/config.json',        // User config
];

/**
 * Load configuration from all sources
 */
export function loadConfig(projectRoot: string = process.cwd()): MAWConfig {
  const cacheKey = projectRoot;
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_TTL_MS) {
    return cached.config;
  }

  let config: Record<string, unknown> = {};

  // Load user-level configs (lowest priority)
  for (const relativePath of [...USER_CONFIG_PATHS].reverse()) {
    const configPath = relativePath.replace('~', process.env.HOME || homedir());
    if (existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        config = deepMerge(config, fileConfig);
      } catch {
        // Skip invalid config files
      }
    }
  }

  // Load project-level configs (higher priority)
  for (const relativePath of [...CONFIG_SEARCH_ORDER].reverse()) {
    const configPath = join(projectRoot, relativePath);
    if (existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        config = deepMerge(config, fileConfig);
      } catch {
        // Skip invalid config files
      }
    }
  }

  // Apply environment variable overrides
  config = applyEnvOverrides(config as Partial<MAWConfig>) as Record<string, unknown>;

  // Validate and apply defaults
  const result = MAWConfigSchema.parse(config);
  configCache.set(cacheKey, { config: result, timestamp: Date.now() });
  return result;
}

/**
 * Save configuration to file
 */
export function saveConfig(
  config: Partial<MAWConfig>,
  scope: 'user' | 'project' = 'project',
  projectRoot: string = process.cwd()
): void {
  const configPath = scope === 'user'
    ? join(process.env.HOME || homedir(), '.maw', 'config.json')
    : join(projectRoot, '.maw', 'config.json');

  const dir = join(configPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get a specific config value by path
 */
export function getConfigValue(
  config: MAWConfig,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set a specific config value by path
 */
export function setConfigValue(
  config: MAWConfig,
  path: string,
  value: unknown
): MAWConfig {
  const parts = path.split('.');
  const newConfig = JSON.parse(JSON.stringify(config));
  let current: Record<string, unknown> = newConfig;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return MAWConfigSchema.parse(newConfig);
}

/**
 * Apply environment variable overrides
 */
function applyEnvOverrides(config: Partial<MAWConfig>): Partial<MAWConfig> {
  // Use type assertion to allow partial updates
  const newConfig: Record<string, unknown> = JSON.parse(JSON.stringify(config));

  // AI API keys from environment
  if (process.env.MAW_CODEX_API_KEY) {
    if (!newConfig.ai) newConfig.ai = {};
    const ai = newConfig.ai as Record<string, unknown>;
    if (!ai.codex) ai.codex = {};
    (ai.codex as Record<string, unknown>).apiKey = process.env.MAW_CODEX_API_KEY;
  }

  if (process.env.MAW_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
    if (!newConfig.ai) newConfig.ai = {};
    const ai = newConfig.ai as Record<string, unknown>;
    if (!ai.gemini) ai.gemini = {};
    (ai.gemini as Record<string, unknown>).apiKey = process.env.MAW_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  }

  // Dashboard port
  if (process.env.MAW_DASHBOARD_PORT) {
    const port = parseInt(process.env.MAW_DASHBOARD_PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.warn('[Config] Invalid MAW_DASHBOARD_PORT, must be 1-65535. Using default.');
    } else {
      if (!newConfig.dashboard) newConfig.dashboard = {};
      (newConfig.dashboard as Record<string, unknown>).port = port;
    }
  }

  // Security settings
  if (process.env.MAW_SANDBOX_LEVEL) {
    const allowed = ['read-only', 'workspace-write', 'danger-full-access'];
    if (!allowed.includes(process.env.MAW_SANDBOX_LEVEL)) {
      console.warn('[Config] Invalid MAW_SANDBOX_LEVEL. Using default.');
    } else {
      if (!newConfig.security) newConfig.security = {};
      (newConfig.security as Record<string, unknown>).defaultSandbox = process.env.MAW_SANDBOX_LEVEL;
    }
  }

  return newConfig as Partial<MAWConfig>;
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Create default configuration file
 */
export function createDefaultConfig(projectRoot: string = process.cwd()): MAWConfig {
  // Use empty object - Zod schema will apply all defaults
  const defaultConfig = {};

  saveConfig(defaultConfig, 'project', projectRoot);
  return MAWConfigSchema.parse(defaultConfig);
}

export function resetConfigCache(): void { configCache.clear(); }

export default { loadConfig, saveConfig, getConfigValue, setConfigValue, createDefaultConfig, resetConfigCache };
