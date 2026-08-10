module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    "vue/setup-compiler-macros": true,
  },
  extends: [
    "eslint:recommended",
    "plugin:vue/vue3-essential",
    "@vue/eslint-config-prettier/skip-formatting",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    "vue/multi-word-component-names": "off",
    "vue/script-setup-uses-vars": "error",
  },
  overrides: [
    {
      files: ["*.vue", "**/*.vue"],
      rules: {
        // vue-eslint-parser 9.4 reports template-only script-setup bindings as
        // unused. Template locals remain covered by vue/no-unused-vars.
        "no-unused-vars": "off",
        "vue/no-unused-vars": "error",
      },
    },
  ],
};
