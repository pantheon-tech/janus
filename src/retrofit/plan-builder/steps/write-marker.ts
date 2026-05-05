import type { Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

const PLACEHOLDER = '{}';

export function generateWriteMarkerStep(): Step {
  return {
    id: 'write-marker',
    category: 'write-marker',
    title: 'Write .janus.json marker',
    commit_message: 'chore: write janus marker',
    preconditions: [],
    operations: [{ op: 'write_file', path: '.janus.json', content: PLACEHOLDER, overwrite: true }],
    commit_paths: ['.janus.json'],
  };
}
