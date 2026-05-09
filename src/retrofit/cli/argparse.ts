export type ArgSpec = {
  string: string[];
  boolean: string[];
  collect: string[]; // repeatable: each occurrence pushed to an array
};

export type ParsedArgs = Record<string, unknown> & { _: string[] };

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  const stringSet = new Set(spec.string);
  const boolSet = new Set(spec.boolean);
  const collectSet = new Set(spec.collect);

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok.startsWith('--')) {
      const eqIdx = tok.indexOf('=');
      const name = eqIdx >= 0 ? tok.slice(2, eqIdx) : tok.slice(2);
      const inlineValue = eqIdx >= 0 ? tok.slice(eqIdx + 1) : undefined;
      if (collectSet.has(name)) {
        const v = inlineValue ?? argv[++i];
        if (v === undefined) throw new Error(`--${name}: missing value`);
        const arr = (out[name] as string[]) ?? [];
        arr.push(v);
        out[name] = arr;
      } else if (stringSet.has(name)) {
        const v = inlineValue ?? argv[++i];
        if (v === undefined) throw new Error(`--${name}: missing value`);
        out[name] = v;
      } else if (boolSet.has(name)) {
        out[name] = inlineValue !== 'false';
      } else {
        // unknown flag — boolean true by default
        out[name] = inlineValue ?? true;
      }
    } else {
      out._.push(tok);
    }
    i++;
  }
  return out;
}
