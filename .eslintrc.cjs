module.exports = {
  root: true,
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "playwright-report",
    "test-results",
    ".vercel",
  ],
  overrides: [
    {
      files: ["src/**/*.{js,jsx}"],
      env: {
        browser: true,
        es2022: true,
      },
      plugins: ["react", "react-hooks"],
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      settings: {
        react: {
          version: "detect",
        },
      },
      extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react-hooks/recommended"],
      rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["api/**/*.js"],
      env: {
        node: true,
        es2022: true,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "script",
      },
      extends: ["eslint:recommended"],
      rules: {
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["*.config.js", "vite.config.js", "scripts/**/*.{js,mjs}", "tests/**/*.js"],
      env: {
        node: true,
        es2022: true,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      extends: ["eslint:recommended"],
      rules: {
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: ["tests/e2e/**/*.js"],
      env: {
        node: true,
        browser: true,
        es2022: true,
      },
    },
  ],
};
