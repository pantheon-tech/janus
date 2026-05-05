import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ClaudeKitSnapshot } from '../types/index.js';

export function analyzeClaudeKit(repoRoot: string): ClaudeKitSnapshot {
  const claudeDir = join(repoRoot, '.claude');
  if (!existsSync(claudeDir)) {
    return {
      has_claude_dir: false,
      has_settings_json: false,
      has_claude_md: false,
      has_pre_janus_md: false,
      hooks: [],
      skills: [],
      misc: [],
    };
  }

  const settingsPath = join(claudeDir, 'settings.json');
  const has_settings_json = existsSync(settingsPath);
  const settings_json = has_settings_json ? safeReadJson(settingsPath) : undefined;
  const has_claude_md = existsSync(join(repoRoot, 'CLAUDE.md'));
  const has_pre_janus_md = existsSync(join(repoRoot, 'CLAUDE.pre-janus.md'));

  const hooks = listFilesRelative(join(claudeDir, 'hooks'));
  const skills = listFilesRelative(join(claudeDir, 'skills'));
  const misc = listClaudeMisc(claudeDir);

  const out: ClaudeKitSnapshot = {
    has_claude_dir: true,
    has_settings_json,
    has_claude_md,
    has_pre_janus_md,
    hooks,
    skills,
    misc,
  };
  if (settings_json !== undefined) out.settings_json = settings_json;
  return out;
}

function safeReadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function listFilesRelative(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  walk(dir, dir, out);
  return out.sort();
}

function walk(base: string, current: string, out: string[]): void {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(base, full, out);
    } else if (stat.isFile()) {
      out.push(relative(base, full));
    }
  }
}

function listClaudeMisc(claudeDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(claudeDir)) {
    if (entry === 'hooks' || entry === 'skills' || entry === 'settings.json') continue;
    const full = join(claudeDir, entry);
    if (statSync(full).isFile()) {
      out.push(entry);
    }
  }
  return out.sort();
}
