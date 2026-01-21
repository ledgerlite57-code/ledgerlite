module.exports = {
  extends: [require.resolve("@ledgerlite/config/eslint-node.cjs")],
  ignorePatterns: [
    "dist/**",
    "eslint.config.cjs",
    ".eslintrc.cjs",
    "jest.config.js",
    "prisma.config.ts",
    "prisma/**",
    "test/**",
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
};
