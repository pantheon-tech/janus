export type SettingsHookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
};

export type SettingsBase = {
  env?: Record<string, string>;
  worktree?: { symlinkDirectories: string[] };
  permissions?: { allow: string[]; deny: string[] };
  cleanupPeriodDays?: number;
  hooks?: Record<string, SettingsHookEntry[]>;
  enabledPlugins?: Record<string, true>;
};

export function buildSettingsBase(args: { workload: string; plugins: string[] }): SettingsBase {
  const base: SettingsBase = {
    env: { OTEL_RESOURCE_ATTRIBUTES: `project=${args.workload}` },
    worktree: { symlinkDirectories: ['node_modules'] },
    permissions: {
      allow: [
        'Bash(pnpm *)',
        'Bash(npx tsc *)',
        'Bash(gh issue:*)',
        'Bash(gh pr:*)',
        'Bash(gh api:*)',
        'Bash(gh search:*)',
        'Bash(gh label:*)',
        'Bash(gh run:*)',
        'Bash(gh repo view:*)',
        'Bash(gh workflow:*)',
        'Bash(git status:*)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Read(**)',
        'Grep(**)',
        'WebFetch(https://code.claude.com/*)',
        'WebFetch(https://docs.claude.com/*)',
        'WebFetch(https://learn.microsoft.com/*)',
      ],
      deny: [
        'Bash(rm -rf *)',
        'Bash(sudo *)',
        'Bash(git push --force:*)',
        'Bash(git push * main)',
        'Bash(npm publish *)',
        'Bash(pnpm publish *)',
        'Read(~/.ssh/**)',
        'Read(~/.aws/**)',
        'Read(~/.gnupg/**)',
        'Read(.env.local)',
        'Read(.env)',
        'Bash(curl * | bash)',
        'Bash(curl * | sh)',
        'Bash(wget * | bash)',
        'Bash(wget * | sh)',
      ],
    },
    cleanupPeriodDays: 7,
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|clear|compact',
          hooks: [{ type: 'command', command: '.claude/hooks/session-start.sh', timeout: 15 }],
        },
      ],
      SessionEnd: [
        {
          hooks: [{ type: 'command', command: '.claude/hooks/session-end.sh', timeout: 15 }],
        },
      ],
      WorktreeCreate: [
        {
          hooks: [{ type: 'command', command: '.claude/hooks/setup-worktree.sh', timeout: 30 }],
        },
      ],
      WorktreeRemove: [
        {
          hooks: [{ type: 'command', command: '.claude/hooks/cleanup-worktree.sh', timeout: 15 }],
        },
      ],
    },
  };
  if (args.plugins.length > 0) {
    base.enabledPlugins = Object.fromEntries(args.plugins.map((p) => [p, true as const]));
  }
  return base;
}
