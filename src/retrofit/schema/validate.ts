import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsImport, { type FormatsPlugin } from 'ajv-formats';
import type { JanusMarker, Plan } from '../types/index.js';
import markerSchema from './marker.schema.json' with { type: 'json' };
import planSchema from './plan.schema.json' with { type: 'json' };

// ajv-formats's published types under NodeNext + esModuleInterop expose the
// module namespace rather than the callable default; normalise either shape.
const addFormats: FormatsPlugin =
  (addFormatsImport as unknown as { default?: FormatsPlugin }).default ??
  (addFormatsImport as unknown as FormatsPlugin);

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// Register marker schema by $id so plan schema's $ref can resolve it.
ajv.addSchema(markerSchema, 'marker.schema.json');

const compiledPlan: ValidateFunction = ajv.compile(planSchema);
const compiledMarker: ValidateFunction = ajv.compile(markerSchema);

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return ['unknown validation error'];
  return errors.map(
    (e) => `${e.instancePath || '<root>'} ${e.message ?? ''} (${JSON.stringify(e.params)})`,
  );
}

export function validatePlan(input: unknown): ValidationResult<Plan> {
  if (compiledPlan(input)) {
    return { ok: true, value: input as Plan };
  }
  return { ok: false, errors: formatErrors(compiledPlan.errors) };
}

export function validateMarker(input: unknown): ValidationResult<JanusMarker> {
  if (compiledMarker(input)) {
    return { ok: true, value: input as JanusMarker };
  }
  return { ok: false, errors: formatErrors(compiledMarker.errors) };
}
