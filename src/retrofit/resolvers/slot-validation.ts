export type SlotValidation = { ok: true } | { ok: false; reason: string };

const RULES: Record<string, RegExp> = {
  workload: /^[a-z][a-z0-9]{2,11}$/,
  github_org: /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/,
  author_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  node_version: /^\d+$/,
};

export function validateSlot(key: string, value: string): SlotValidation {
  const rule = RULES[key];
  if (!rule) return { ok: true };
  if (!rule.test(value)) {
    return { ok: false, reason: `${key}=${value} does not match ${rule}` };
  }
  return { ok: true };
}

// Normalize node-version range expressions to the leading integer.
// Examples: ">=24" → "24", "^20.0.0" → "20", "24.x" → "24".
// Returns undefined if no leading integer can be extracted.
export function normalizeNodeVersion(input: string): string | undefined {
  if (!input) return undefined;
  const m = input.trim().match(/(\d+)/);
  return m ? m[1]! : undefined;
}
