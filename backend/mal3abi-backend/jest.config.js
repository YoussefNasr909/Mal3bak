/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.load-env.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  transform: {},
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  testTimeout: 10000,
};

export default config;
