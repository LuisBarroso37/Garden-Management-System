import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dayjs',
              message:
                'Import dayjs from "src/utils/dayjs" (or the appropriate wrapper) instead of importing it directly.',
            },
          ],
          patterns: [
            {
              group: ['dayjs/*'],
              message:
                'Import dayjs from "src/utils/dayjs" (or the appropriate wrapper) instead of importing it directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/utils/dayjs.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
