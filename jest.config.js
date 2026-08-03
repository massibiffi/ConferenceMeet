// Unit tests target the pure logic in lib/ (no React Native runtime needed), so
// we use a plain ts-jest + node setup — fast and dependency-light. Component and
// DB/RLS tests would use jest-expo and a Supabase integration harness respectively
// (see the Testing section of the README).
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
};
