import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Regex matching the owned tables. Centralized so all three scoping
// rules stay in sync — if a new owned table appears, add it here once.
// After fold 0009: items+itemImages are gone; placements (boardItems)
// carry metadata + boardItemImages carry the blobs.
const OWNED_TABLES = /^(boards|boardItems|boardItemImages)$/;

// Smells that break the scoped-repo guarantee in services. The repos in
// db/repos/ are the ONLY place these patterns are allowed; everywhere else
// in services/** they're errors. See .claude/skills/service-design.
const repoBypassRules = [
  {
    // tx.db.query.<owned> or ctx.db.query.<owned>
    selector: [
      'MemberExpression',
      "[object.type='MemberExpression']",
      "[object.property.name='query']",
      "[object.object.type='MemberExpression']",
      "[object.object.property.name='db']",
      `[property.name=${OWNED_TABLES}]`,
    ].join(''),
    message:
      'Bypassing the scoped repo for reads. Use tx.<table>.byId / byIdOrThrow / list… instead of tx.db.query.<owned-table>. See .claude/skills/service-design.',
  },
  {
    // tx.db.insert(schema.<owned>) / .update(schema.<owned>) / .delete(schema.<owned>)
    selector: [
      'CallExpression',
      "[callee.type='MemberExpression']",
      "[callee.object.type='MemberExpression']",
      "[callee.object.property.name='db']",
      '[callee.property.name=/^(insert|update|delete)$/]',
      "[arguments.0.type='MemberExpression']",
      "[arguments.0.object.name='schema']",
      `[arguments.0.property.name=${OWNED_TABLES}]`,
    ].join(''),
    message:
      'Bypassing the scoped repo for writes. Use tx.<table>.stageInsert/stageUpdate/stageDelete instead of tx.db.insert/update/delete(schema.<owned-table>). See .claude/skills/service-design.',
  },
  {
    // schema.<owned>.ownerId — hand-rolled scope predicate
    selector: [
      'MemberExpression',
      "[property.name='ownerId']",
      "[object.type='MemberExpression']",
      "[object.object.name='schema']",
      `[object.property.name=${OWNED_TABLES}]`,
    ].join(''),
    message:
      "Hand-rolling the ownership predicate. The scoped repo already filters by tx.scope.userId — calling tx.<table>.<method> means future devs can't forget. See .claude/skills/service-design.",
  },
];

export default tseslint.config([
  { ignores: ['dist', '.wrangler', 'worker-configuration.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...repoBypassRules],
    },
  },
]);
