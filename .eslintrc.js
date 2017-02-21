module.exports = {
    "extends": [
      "airbnb/base",
      "plugin:meteor/recommended"
    ],
    "plugins": [
        "meteor"
    ],
    "settings": {
      "import/resolver": "meteor"
    },
    "rules": {
      "guard-for-in": 0,
      "radix": 0,
      "semi": 0,  // Henning: disable semi rule
      "max-len": 0,  // Henning: disable max-len rule
      "space-infix-ops": 0,  // Henning: disable space-infix-ops rule
      "no-unused-expressions": 0,  // Henning: disable to enable stuff like ``expect(browser.getText(modalFormCreatedAt)).to.be.defined``
      "no-multi-spaces": 0,  // Henning: we want to define consts with multispaces
      "func-names": 0,  // Henning: we want to use stuff like ``$('tbody tr').each(function (iRow) {`` without being destraced by our linter
      "consistent-return": 0,
      "class-methods-use-this": 0,
      "import/first": 0,
      "import/no-absolute-path": 0,
      "import/no-extraneous-dependencies": 0,
      "import/no-unresolved": 0,
      "import/newline-after-import": 0,
      "import/prefer-default-export": 0,  // https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/prefer-default-export.md
      "import/extensions": 0,  // https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/extensions.md
      "no-underscore-dangle": 0,  // http://eslint.org/docs/rules/no-underscore-dangle
      "global-require": 0,
      "no-restricted-syntax": ["error", "ForInStatement", "LabeledStatement", "WithStatement"]
    }
};
