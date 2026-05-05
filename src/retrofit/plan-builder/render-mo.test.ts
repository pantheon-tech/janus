import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderMo } from './render-mo.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('renderMo', () => {
  it('substitutes a single slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, 'Hello {{workload}}!');
    const out = renderMo(JANUS_ROOT, tmpl, { workload: 'foo' });
    expect(out.toString('utf8')).toBe('Hello foo!');
  });

  it('substitutes multiple slots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, '{{author}} <{{author_email}}>');
    const out = renderMo(JANUS_ROOT, tmpl, { author: 'Daniel', author_email: 'd@e.com' });
    expect(out.toString('utf8')).toBe('Daniel <d@e.com>');
  });

  it('respects custom-delimiter directive in .tmpl files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, '{{=<% %>=}}{{ github.actions.passthrough }}<%workload%>');
    const out = renderMo(JANUS_ROOT, tmpl, { workload: 'foo' });
    expect(out.toString('utf8')).toBe('{{ github.actions.passthrough }}foo');
  });
});
