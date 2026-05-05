import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadUnrecognizedToolsAllowlist } from './unrecognized-tools-allowlist.js';

describe('loadUnrecognizedToolsAllowlist', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  function makeJanusRoot(depsContent: string | null): string {
    const root = mkdtempSync(join(tmpdir(), 'janus-allowlist-test-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    if (depsContent !== null) {
      mkdirSync(join(root, 'docs/conventions'), { recursive: true });
      writeFileSync(join(root, 'docs/conventions/dependencies.md'), depsContent);
    }
    return root;
  }

  it('returns names listed under the allowlist heading', async () => {
    const root = makeJanusRoot(
      [
        '# Dependencies',
        '',
        '## Unrecognized tools (retrofit warning allowlist)',
        '',
        '- lint-staged',
        '- rome',
        '* dprint',
        '',
        '## Some other section',
        '',
        '- not-included',
      ].join('\n'),
    );
    const list = await loadUnrecognizedToolsAllowlist(root);
    expect(list).toEqual(['lint-staged', 'rome', 'dprint']);
  });

  it('returns [] when the heading is absent', async () => {
    const root = makeJanusRoot(
      ['# Dependencies', '', '## Other heading', '', '- foo'].join('\n'),
    );
    const list = await loadUnrecognizedToolsAllowlist(root);
    expect(list).toEqual([]);
  });

  it('returns [] when the file is absent', async () => {
    const root = makeJanusRoot(null);
    const list = await loadUnrecognizedToolsAllowlist(root);
    expect(list).toEqual([]);
  });

  it('only collects bullets between the heading and the next `## ` heading', async () => {
    const root = makeJanusRoot(
      [
        '## Unrecognized tools (retrofit warning allowlist)',
        '',
        '- alpha',
        '- beta',
        '## Next section',
        '- not-collected',
        '## Yet another',
        '- also-not-collected',
      ].join('\n'),
    );
    const list = await loadUnrecognizedToolsAllowlist(root);
    expect(list).toEqual(['alpha', 'beta']);
  });

  it('ignores blank lines and trims whitespace from bullet text', async () => {
    const root = makeJanusRoot(
      [
        '## Unrecognized tools (retrofit warning allowlist)',
        '',
        '-   spaced-out   ',
        '',
        '*\ttabbed-bullet',
        '',
      ].join('\n'),
    );
    const list = await loadUnrecognizedToolsAllowlist(root);
    expect(list).toEqual(['spaced-out', 'tabbed-bullet']);
  });
});
