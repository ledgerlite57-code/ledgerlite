module.exports = {
  extends: [require.resolve("@ledgerlite/config/eslint-react.cjs")],
  ignorePatterns: [".next/**", "eslint.config.cjs", ".eslintrc.cjs", "next.config.js", "postcss.config.js"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
};
