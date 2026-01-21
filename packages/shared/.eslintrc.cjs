module.exports = {
  extends: [require.resolve("@ledgerlite/config/eslint-node.cjs")],
  ignorePatterns: ["dist/**", "eslint.config.cjs", ".eslintrc.cjs"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
};
