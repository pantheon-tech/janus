import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageJsonSnapshot, PluginEvidence } from '../types/index.js';

export function analyzePluginEvidence(
  repoRoot: string,
  pkg: PackageJsonSnapshot | undefined,
): PluginEvidence {
  const evidence: PluginEvidence = {
    'frontend-design@claude-plugins-official': [],
    'playwright@claude-plugins-official': [],
    'pyright-lsp@claude-plugins-official': [],
  };

  // frontend-design
  for (const f of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
    if (existsSync(join(repoRoot, f))) {
      evidence['frontend-design@claude-plugins-official'].push(f);
    }
  }
  for (const entry of safeReaddir(repoRoot)) {
    if (/^next\.config\./.test(entry)) {
      evidence['frontend-design@claude-plugins-official'].push(entry);
    }
  }
  if (pkg?.dependencies?.react) {
    evidence['frontend-design@claude-plugins-official'].push('package.json:dependencies.react');
  }

  // playwright
  for (const f of ['playwright.config.js', 'playwright.config.ts']) {
    if (existsSync(join(repoRoot, f))) {
      evidence['playwright@claude-plugins-official'].push(f);
    }
  }
  if (pkg?.devDependencies?.['@playwright/test']) {
    evidence['playwright@claude-plugins-official'].push(
      'package.json:devDependencies.@playwright/test',
    );
  }

  // pyright-lsp
  if (existsSync(join(repoRoot, 'pyproject.toml'))) {
    evidence['pyright-lsp@claude-plugins-official'].push('pyproject.toml');
  }
  if (existsSync(join(repoRoot, 'Pipfile'))) {
    evidence['pyright-lsp@claude-plugins-official'].push('Pipfile');
  }
  for (const entry of safeReaddir(repoRoot)) {
    if (/^requirements.*\.txt$/.test(entry)) {
      evidence['pyright-lsp@claude-plugins-official'].push(entry);
    }
  }

  for (const key of Object.keys(evidence) as Array<keyof PluginEvidence>) {
    evidence[key].sort();
  }
  return evidence;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
