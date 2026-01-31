
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    '^.+\\.jsx?$': ['ts-jest', { isolatedModules: true }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@polymarket|ethers|@ethersproject|axios)/)"
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};