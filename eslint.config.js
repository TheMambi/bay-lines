import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'error',
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z]', args: 'after-used', ignoreRestSiblings: true },
      ],
      'no-unused-expressions': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['api/**', 'scripts/**', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['**/*.test.js'], languageOptions: { globals: { ...globals.node } } },
];
