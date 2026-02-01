import { type Config } from 'prettier';

const config: Config = {
  arrowParens: 'avoid',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  trailingComma: 'es5',
  endOfLine: 'lf',

  plugins: ['prettier-plugin-tailwindcss', '@ianvs/prettier-plugin-sort-imports'],

  // sort-imports plugin options
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '5.9.3',
};

export default config;
