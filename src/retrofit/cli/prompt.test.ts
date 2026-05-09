import { PassThrough, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import { makeSlotPromptCallback, makeConfirmPluginsCallback } from './prompt.js';

function makeRl(input: PassThrough, output: Writable) {
  return createInterface({ input, output, historySize: 0 });
}

function makeInput(lines: string[]): PassThrough {
  const input = new PassThrough();
  let index = 0;

  const sendNext = () => {
    if (index < lines.length) {
      input.write(lines[index]);
      index++;
      setImmediate(sendNext);
    }
  };

  sendNext();
  return input;
}

describe('makeSlotPromptCallback', () => {
  it('returns the line typed by the user (without trailing newline)', async () => {
    const input = makeInput(['foo\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const rl = makeRl(input, output);
    const prompt = makeSlotPromptCallback(rl);
    const v = await prompt('workload');
    expect(v).toBe('foo');
    rl.close();
  });

  it('asks once per call and returns sequential lines on the same shared interface', async () => {
    const input = makeInput(['first\n', 'second\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const rl = makeRl(input, output);
    const prompt = makeSlotPromptCallback(rl);
    expect(await prompt('a')).toBe('first');
    expect(await prompt('b')).toBe('second');
    rl.close();
  });
});

describe('makeConfirmPluginsCallback (shares the rl with slot prompt)', () => {
  it('reads y/n then additions on the same interface', async () => {
    const input = makeInput(['y\n', 'banana-claude@banana-claude-marketplace\n', '\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const rl = makeRl(input, output);
    const confirm = makeConfirmPluginsCallback(rl);
    const out = await confirm(['frontend-design@claude-plugins-official']);
    expect(out).toEqual([
      'frontend-design@claude-plugins-official',
      'banana-claude@banana-claude-marketplace',
    ]);
    rl.close();
  });
});
