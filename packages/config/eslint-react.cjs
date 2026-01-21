const base = require("./eslint-base.cjs");

module.exports = {
  ...base,
  env: {
    ...base.env,
    browser: true,
  },
  plugins: [...base.plugins, "react"],
  extends: [...base.extends, "plugin:react/recommended", "next/core-web-vitals"],
  rules: {
    ...(base.rules ?? {}),
    "react-hooks/rules-of-hooks": "off",
    "react-hooks/exhaustive-deps": "off",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
