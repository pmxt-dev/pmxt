#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { execute } = require("@oclif/core");
const { normalizeArgvAliases } = require("../cli/argv-aliases.js");

const packageRoot =
  path.basename(path.dirname(__dirname)) === "dist"
    ? path.resolve(__dirname, "..", "..")
    : path.resolve(__dirname, "..");

void execute({ dir: packageRoot, args: normalizeArgvAliases(process.argv.slice(2)) });
