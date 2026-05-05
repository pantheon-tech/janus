import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageJsonSnapshot, RepoSnapshot } from '../types/index.js';

type PMResult = Pick<
  RepoSnapshot,
  'package_manager' | 'lockfiles_present' | 'package_json' | 'has_package_json' | 'workspace'
>;

const LOCKFILE_TO_PM: Array<{ lockfile: string; pm: 'pnpm' | 'npm' | 'yarn' }> = [
  { lockfile: 'pnpm-lock.yaml', pm: 'pnpm' },
  { lockfile: 'package-lock.json', pm: 'npm' },
  { lockfile: 'yarn.lock', pm: 'yarn' },
];

export function analyzePackageManager(repoRoot: string): PMResult {
  const pkgPath = join(repoRoot, 'package.json');
  const has_package_json = existsSync(pkgPath);
  const package_json = has_package_json ? parsePackageJson(pkgPath) : undefined;

  const lockfiles_present = LOCKFILE_TO_PM.filter(({ lockfile }) =>
    existsSync(join(repoRoot, lockfile)),
  ).map((l) => l.lockfile);

  const package_manager = detectPackageManager(lockfiles_present, package_json);
  const workspace = detectPnpmWorkspace(repoRoot);

  const result: PMResult = {
    package_manager,
    lockfiles_present,
    has_package_json,
  };
  if (package_json !== undefined) result.package_json = package_json;
  if (workspace !== undefined) result.workspace = workspace;
  return result;
}

function detectPackageManager(
  lockfiles_present: string[],
  pkg: PackageJsonSnapshot | undefined,
): 'pnpm' | 'npm' | 'yarn' | 'none' {
  if (lockfiles_present.includes('pnpm-lock.yaml')) return 'pnpm';
  if (pkg?.packageManager?.startsWith('pnpm@')) return 'pnpm';
  if (lockfiles_present.includes('package-lock.json')) return 'npm';
  if (lockfiles_present.includes('yarn.lock')) return 'yarn';
  return 'none';
}

function parsePackageJson(pkgPath: string): PackageJsonSnapshot {
  const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  const out: PackageJsonSnapshot = { raw };
  const type = raw.type as PackageJsonSnapshot['type'] | undefined;
  if (type !== undefined) out.type = type;
  if (typeof raw.packageManager === 'string') out.packageManager = raw.packageManager;
  if (raw.scripts) out.scripts = raw.scripts as Record<string, string>;
  if (raw.dependencies) out.dependencies = raw.dependencies as Record<string, string>;
  if (raw.devDependencies) out.devDependencies = raw.devDependencies as Record<string, string>;
  if (raw.engines) out.engines = raw.engines as Record<string, string>;
  if (raw.author !== undefined) {
    out.author = raw.author as string | { name?: string; email?: string };
  }
  if (typeof raw.description === 'string') out.description = raw.description;
  if (typeof raw.license === 'string') out.license = raw.license;
  return out;
}

function detectPnpmWorkspace(repoRoot: string): { type: 'pnpm'; packages: string[] } | undefined {
  const wsPath = join(repoRoot, 'pnpm-workspace.yaml');
  if (!existsSync(wsPath)) return undefined;
  const content = readFileSync(wsPath, 'utf8');
  const packages: string[] = [];
  let inPackages = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (m) {
        packages.push(m[1]!);
      } else if (/^\S/.test(line)) {
        break;
      }
    }
  }
  return { type: 'pnpm', packages };
}
