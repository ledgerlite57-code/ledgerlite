const base = require("./eslint-base.cjs");

module.exports = {
  ...base,
  env: {
    ...base.env,
    node: true,
  },
};
