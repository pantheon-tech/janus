// CommonJS syntax required because this archetype uses "type": "commonjs".
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'perf', 'ci', 'build', 'revert'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
