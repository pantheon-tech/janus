import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { SlotKey } from '../resolvers/slots.js';

export interface PromptIO {
  rl: Interface;
  close(): void;
}

/**
 * Construct a single shared readline interface for the duration of one CLI run.
 * Both the slot-prompt and plugin-confirmation callbacks must consume THIS rl —
 * creating two interfaces over the same stdin produces lost-keystroke bugs.
 */
export function createPromptIO(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): PromptIO {
  const rl = createInterface({ input, output });
  return {
    rl,
    close: () => rl.close(),
  };
}

export type SlotPromptCallback = (key: SlotKey) => Promise<string>;

export function makeSlotPromptCallback(rl: Interface): SlotPromptCallback {
  return async (key: SlotKey): Promise<string> => askLine(rl, `Slot value for ${key}: `);
}

export type ConfirmPluginsCallback = (proposed: string[]) => Promise<string[]>;

export function makeConfirmPluginsCallback(rl: Interface): ConfirmPluginsCallback {
  return async (proposed: string[]): Promise<string[]> => {
    const output: Writable = (rl as unknown as { output: Writable }).output;
    let kept = proposed;
    if (proposed.length > 0) {
      output.write(`Proposed plugins:\n  ${proposed.join('\n  ')}\nEnable these? [Y/n]: `);
      const yn = (await askLine(rl, '')).trim().toLowerCase();
      if (yn === 'n' || yn === 'no') kept = [];
    } else {
      output.write('No plugins detected. ');
    }
    output.write('Add another? Empty to finish. (e.g., banana-claude@banana-claude-marketplace)\n');
    const additions: string[] = [];
    while (true) {
      const line = (await askLine(rl, '> ')).trim();
      if (!line) break;
      additions.push(line);
    }
    return [...kept, ...additions];
  };
}

function askLine(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer)));
}
