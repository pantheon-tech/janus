// CJS-compatible commitlint config.
// Uses module.exports instead of export default because this package sets
// "type": "commonjs" for tsup CJS output compatibility.
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
