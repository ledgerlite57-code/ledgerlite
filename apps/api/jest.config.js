module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*(\\.spec|\\.test|\\.e2e-spec)\\.ts$",
  moduleNameMapper: {
    "^@ledgerlite/shared$": "<rootDir>/../../packages/shared/src",
  },
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  setupFiles: ["dotenv/config"],
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "coverage",
  testEnvironment: "node",
};
