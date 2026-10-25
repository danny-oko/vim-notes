import { registerHooks } from 'node:module'
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// tsc is TypeScript 7, which has no JavaScript API yet, so typescript-eslint
// parses with the side-by-side TypeScript 6 package instead.
registerHooks({
  resolve: (specifier, context, next) => next(specifier === 'typescript' ? '@typescript/typescript6' : specifier, context)
})
const { default: tseslint } = await import('typescript-eslint')

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/main/**', 'src/preload/**', 'e2e/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: globals.node }
  },
  {
    // e2e/ for the page.evaluate callbacks, which run in the window.
    files: ['src/renderer/**', 'src/preload/**', 'e2e/**'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended]
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
