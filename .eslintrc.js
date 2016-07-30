module.exports = {
    "extends": "airbnb",
    "plugins": [
        "react"
    ],
    "rules": {
      "semi": 0,  // Henning: disable semi rule
      "max-len": 0,  // Henning: disable max-len rule
      "space-infix-ops": 0,  // Henning: disable space-infix-ops rule
      "no-unused-expressions": 0,  // Henning: disable to enable stuff like ``expect(browser.getText(modalFormCreatedAt)).to.be.defined``
      "no-multi-spaces": 0,  // Henning: we want to define consts with multispaces
      "func-names": 0,  // Henning: we want to use stuff like ``$('tbody tr').each(function (iRow) {`` without being destraced by our linter
      "consistent-return": 0,  //
      "no-underscore-dangle": 0  //
    }
};
