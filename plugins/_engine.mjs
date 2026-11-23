// Minimal no-op shim so core career-ops scripts (doctor, scan, validate-portals,
// verify-pipeline, audit-portals) run cleanly without optional third-party plugins.

export function pluginRoots() {
  return [];
}

export function resolveSuccessorIds() {
  return new Map();
}

export function discoverPlugins() {
  return [];
}

export function pluginStatus() {
  return { enabled: false, missingEnv: [] };
}

export async function mergeProviderPlugins(providers) {
  return providers;
}
