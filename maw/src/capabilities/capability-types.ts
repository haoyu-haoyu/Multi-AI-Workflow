import type { SkillRuntime, SkillSecurityConfig } from '../core/skill-registry.js';

export type CapabilitySource = 'skill';

export interface CapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  source: CapabilitySource;
  provider?: string;
  runtime: SkillRuntime;
  entryPoint: string;
  security: SkillSecurityConfig;
  triggers: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
