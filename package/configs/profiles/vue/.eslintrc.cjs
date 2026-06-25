/* eslint-env node */
module.exports = {
  root: true,
  settings: {
    'import/extensions': ['.js', '.jsx', '.ts', '.tsx', '.vue'],
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
      },
      alias: [
        ['@', './src'],
        ['@api', './src/api'],
        ['@assets', './src/assets'],
      ],
    },
  },
};
