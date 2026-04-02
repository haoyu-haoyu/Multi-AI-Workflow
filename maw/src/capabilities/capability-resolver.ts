import type { BaseAIAdapter } from '../adapters/base-adapter.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { CapabilityDescriptor } from './capability-types.js';

export interface CapabilityAwarePhaseLike {
  id: string;
  name: string;
  type: string;
  capabilityId?: string;
  preferredProviders?: string[];
  fallbackProviders?: string[];
  assignedAI?: string;
}

export interface ResolvedPhaseExecution {
  capability?: CapabilityDescriptor;
  provider: BaseAIAdapter;
  providerName: string;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value !== 'auto')))];
}

export function getDefaultCapabilityIdForPhase(phase: CapabilityAwarePhaseLike): string | undefined {
  switch (phase.type) {
    case 'planning':
      return 'plan.task';
    case 'review':
      return phase.assignedAI === 'codex' ? 'analyze.code' : 'review.changes';
    case 'execution':
      return phase.assignedAI === 'codex' ? 'implement.code' : 'execute.general';
    case 'delegation':
      if (phase.assignedAI === 'gemini') {
        return 'analyze.multimodal';
      }
      if (phase.assignedAI === 'claude') {
        return 'synthesize.outputs';
      }
      return 'implement.code';
    default:
      return undefined;
  }
}

export function resolvePhaseExecution(
  phase: CapabilityAwarePhaseLike,
  providerRegistry: ProviderRegistry,
  capabilityRegistry: CapabilityRegistry,
): ResolvedPhaseExecution {
  const capabilityId = phase.capabilityId || getDefaultCapabilityIdForPhase(phase);
  const capability = capabilityId ? capabilityRegistry.get(capabilityId) : undefined;

  if (phase.capabilityId && !capability) {
    throw new Error(`Capability not found: ${phase.capabilityId}`);
  }

  const providerCandidates = unique([
    ...(phase.preferredProviders || []),
    ...(capability?.preferredProviders || []),
    capability?.provider,
    phase.assignedAI,
    ...(phase.fallbackProviders || []),
  ]);

  if (providerCandidates.length === 0) {
    throw new Error(`No provider candidates available for phase ${phase.name}`);
  }

  for (const providerName of providerCandidates) {
    const provider = providerRegistry.get(providerName);
    if (provider) {
      return {
        capability,
        provider,
        providerName,
      };
    }
  }

  throw new Error(
    `No registered provider available for phase ${phase.name}. Tried: ${providerCandidates.join(', ')}`,
  );
}
