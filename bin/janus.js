#!/usr/bin/env node
/**
 * janus CLI — dispatches to bash scripts bundled with the package.
 *
 * Subcommands:
 *   bootstrap   install user-scope (~/.claude/) hooks, skills, rules, baseline settings
 *   scaffold    create a new project from janus templates (interactive)
 *   check       verify ~/.claude/ has the expected user-scope kit
 *   update      alias for `bootstrap --update`
 *   help        show this message
 *
 * Usage:
 *   npx @pantheon-tech/janus <subcommand> [args...]
 *   janus <subcommand> [args...]   (when installed globally or via npm link)
 *
 * The CLI is a thin spawn wrapper. All real work lives in scripts/*.sh so
 * the same scripts can be invoked directly from the repo without Node.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JANUS_ROOT = join(__dirname, '..');
const SCRIPTS = join(JANUS_ROOT, 'scripts');

const COMMANDS = {
  bootstrap: {
    script: join(SCRIPTS, 'setup-user-scope.sh'),
    summary: 'Install user-scope (~/.claude/) hooks, skills, rules, baseline settings',
  },
  scaffold: {
    script: join(SCRIPTS, 'scaffold.sh'),
    summary: 'Create a new project from janus templates (interactive)',
  },
  check: {
    script: join(SCRIPTS, 'check-user-scope.sh'),
    summary: 'Verify ~/.claude/ has the expected user-scope kit',
  },
};

const TS_COMMANDS = {
  diagnose: {
    module: join(JANUS_ROOT, 'dist/retrofit/cli/diagnose-cmd.js'),
    exportName: 'runDiagnose',
    summary: 'Analyze the current repo and write a retrofit plan to .janus-retrofit.json',
  },
  retrofit: {
    module: join(JANUS_ROOT, 'dist/retrofit/cli/retrofit-cmd.js'),
    exportName: 'runRetrofit',
    summary: 'Apply a retrofit plan, landing changes as commits on a feature branch',
  },
};

function printHelp() {
  console.log('janus — portable project starter kit\n');
  console.log('Usage: janus <command> [args...]\n');
  console.log('Commands:');
  for (const [name, { summary }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(10)} ${summary}`);
  }
  for (const [name, { summary }] of Object.entries(TS_COMMANDS)) {
    console.log(`  ${name.padEnd(10)} ${summary}`);
  }
  console.log(`  ${'update'.padEnd(10)} Alias for \`bootstrap --update\``);
  console.log(`  ${'help'.padEnd(10)} Show this message`);
  console.log('\nExamples:');
  console.log('  npx @pantheon-tech/janus bootstrap');
  console.log('  npx @pantheon-tech/janus scaffold');
  console.log('  npx @pantheon-tech/janus check');
  console.log('\nFor subcommand-specific help:');
  console.log('  janus <command> --help');
}

const [, , cmd, ...args] = process.argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
}

async function main() {
  if (cmd === 'update') {
    // alias
    args.unshift('--update');
    runScript(COMMANDS.bootstrap.script, args);
  } else if (COMMANDS[cmd]) {
    runScript(COMMANDS[cmd].script, args);
  } else if (TS_COMMANDS[cmd]) {
    await runTsCommand(TS_COMMANDS[cmd], args);
  } else {
    console.error(`janus: unknown command \`${cmd}\`\n`);
    printHelp();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

function runScript(script, scriptArgs) {
  if (!existsSync(script)) {
    console.error(`janus: script not found: ${script}`);
    console.error(
      '       (the package may be missing files; reinstall with `npx @pantheon-tech/janus@latest`)',
    );
    process.exit(1);
  }
  const result = spawnSync('bash', [script, ...scriptArgs], { stdio: 'inherit' });
  if (result.error) {
    console.error(`janus: failed to spawn bash: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

async function runTsCommand({ module, exportName }, scriptArgs) {
  if (!existsSync(module)) {
    console.error(`janus: subcommand requires \`pnpm build\` first; missing ${module}`);
    process.exit(1);
  }
  const mod = await import(module);
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    console.error(`janus: ${module} did not export ${exportName}`);
    process.exit(1);
  }
  const code = await fn(scriptArgs);
  process.exit(code ?? 0);
}
