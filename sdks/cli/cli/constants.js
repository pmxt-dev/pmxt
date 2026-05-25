"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = exports.LOCAL_URL = exports.HOSTED_URL = void 0;
exports.resolvePmxtBaseUrl = resolvePmxtBaseUrl;

exports.HOSTED_URL = "https://api.pmxt.dev";
exports.LOCAL_URL = "http://localhost:3847";
exports.ENV = {
  API_KEY: "PMXT_API_KEY",
  BASE_URL: "PMXT_BASE_URL",
};

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function resolvePmxtBaseUrl(options = {}) {
  const baseUrl = trimTrailingSlash(
    options.baseUrl || exports.HOSTED_URL,
  );
  return {
    baseUrl,
    isHosted: baseUrl === exports.HOSTED_URL,
    pmxtApiKey: options.pmxtApiKey,
  };
}
