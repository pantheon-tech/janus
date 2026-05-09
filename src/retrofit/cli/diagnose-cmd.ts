import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUnrecognizedToolsAllowlist } from '../analyzer/unrecognized-tools-allowlist.js';
import { JanusError } from '../errors.js';
import { diagnose } from '../plan-builder/diagnose.js';
import type { SlotKey } from '../resolvers/slots.js';
import type { Plan } from '../types/index.js';
import { parseArgs } from './argparse.js';
import { formatDiagnoseSummary } from './format-diagnose-summary.js';
import { createPromptIO, makeConfirmPluginsCallback, makeSlotPromptCallback } from './prompt.js';

const DEFAULT_OUT = '.janus-retrofit.json';
const __dirname = dirname(fileURLToPath(import.meta.url));
const JANUS_ROOT = resolve(__dirname, '..', '..', '..'); // dist/retrofit/cli/ → janus root

export async function runDiagnose(argv: string[]): Promise<number> {
  try {
    if (process.platform === 'win32') {
      console.error('janus retrofit is not supported on Windows in v0.1.');
      return 1;
    }
    let args: ReturnType<typeof parseArgs>;
    try {
      args = parseArgs(argv, {
        string: ['archetype', 'out'],
        boolean: ['non-interactive', 'help'],
        collect: ['slot', 'plugin', 'no-plugin'],
      });
    } catch (e) {
      console.error(`janus diagnose: ${(e as Error).message}`);
      return 1;
    }
    if (args.help) {
      printDiagnoseHelp();
      return 0;
    }
    const archetype = (args.archetype as string | undefined) ?? '';
    if (!archetype) {
      console.error('janus diagnose: --archetype is required');
      printDiagnoseHelp();
      return 1;
    }
    const cliSlots: Partial<Record<SlotKey, string>> = {};
    for (const entry of (args.slot as string[] | undefined) ?? []) {
      const eq = entry.indexOf('=');
      if (eq < 0) {
        console.error(`janus diagnose: --slot expects key=value, got: ${entry}`);
        return 1;
      }
      cliSlots[entry.slice(0, eq) as SlotKey] = entry.slice(eq + 1);
    }
    const cliPluginAdd = (args.plugin as string[] | undefined) ?? [];
    // Validate --plugin format up-front. Spec §11 says values look like
    // `name@source`. We surface this as a CLI-input error (return 1) rather
    // than letting it slip into diagnose() and surface as a generic JanusError.
    for (const entry of cliPluginAdd) {
      if (!entry.includes('@')) {
        console.error(`janus diagnose: --plugin expects name@source, got: ${entry}`);
        return 1;
      }
    }
    const cliPluginRemove = (args['no-plugin'] as string[] | undefined) ?? [];
    const nonInteractive = Boolean(args['non-interactive']);
    const outPath = (args.out as string | undefined) ?? DEFAULT_OUT;

    // Plan 2 owns the allowlist loader. We thread the result through to
    // diagnose() — Plan 2 already extended analyze() to accept it, so no
    // further wiring is required from Plan 5 inside the analyzer.
    const unrecognizedToolsAllowlist = await loadUnrecognizedToolsAllowlist(JANUS_ROOT);

    const io = nonInteractive ? undefined : createPromptIO();
    const prompt = io ? makeSlotPromptCallback(io.rl) : undefined;
    const confirmPlugins = io ? makeConfirmPluginsCallback(io.rl) : undefined;

    let plan: Plan;
    try {
      plan = await diagnose({
        repoRoot: process.cwd(),
        archetype,
        janusRoot: JANUS_ROOT,
        cliSlots,
        cliPluginAdd,
        cliPluginRemove,
        nonInteractive,
        unrecognizedToolsAllowlist,
        ...(prompt ? { prompt } : {}),
        ...(confirmPlugins ? { confirmPlugins } : {}),
      });
    } finally {
      io?.close();
    }

    writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(formatDiagnoseSummary(plan, outPath));
    return 0;
  } catch (e) {
    if (e instanceof JanusError) {
      console.error(`janus diagnose: ${e.code}: ${e.message}`);
      if (e.remediation) console.error(`  → ${e.remediation}`);
      return 1;
    }
    console.error(`janus diagnose: internal error: ${(e as Error).message}`);
    return 2;
  }
}

function printDiagnoseHelp(): void {
  console.log(`Usage: janus diagnose --archetype <name> [options]

Options:
  --archetype <name>            (required) one of: generic-ts, backend-functions,
                                backend-container-app, frontend-vite-react,
                                mcp-server, monorepo-root
  --out <path>                  default: ${DEFAULT_OUT}
  --slot key=value              repeatable; e.g. --slot workload=foo
  --plugin name@source          repeatable; force-enable a plugin
  --no-plugin name              repeatable; suppress an auto-detected plugin
  --non-interactive             fail if any required slot/plugin needs a prompt
  --help                        show this message
`);
}
