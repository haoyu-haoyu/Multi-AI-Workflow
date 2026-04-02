import type { CapabilityDescriptor } from './capability-types.js';

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDescriptor>();

  register(capability: CapabilityDescriptor): void {
    this.capabilities.set(capability.id, capability);
  }

  registerMany(capabilities: CapabilityDescriptor[]): void {
    for (const capability of capabilities) {
      this.register(capability);
    }
  }

  get(id: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(id);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  list(): CapabilityDescriptor[] {
    return Array.from(this.capabilities.values());
  }

  clear(): void {
    this.capabilities.clear();
  }
}
