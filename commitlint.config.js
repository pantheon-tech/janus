// Conventional Commits enforcement
// Reference: https://www.conventionalcommits.org/en/v1.0.0/
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'perf', 'ci', 'build', 'revert'],
    ],
    'subject-case': [0], // allow any case in subject
    'body-max-line-length': [0], // allow long bodies
  },
};
