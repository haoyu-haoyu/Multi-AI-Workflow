import type { SkillRuntime, SkillSecurityConfig } from '../core/skill-registry.js';

export type CapabilitySource = 'skill' | 'builtin';

export interface CapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  source: CapabilitySource;
  provider?: string;
  preferredProviders?: string[];
  runtime: SkillRuntime;
  entryPoint: string;
  security: SkillSecurityConfig;
  triggers: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
