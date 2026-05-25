#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { execute } = require("@oclif/core");
const { normalizeArgvAliases } = require("../cli/argv-aliases.js");
const { ROOT_HELP, shouldShowRootHelp } = require("../cli/help.js");

const packageRoot =
  path.basename(path.dirname(__dirname)) === "dist"
    ? path.resolve(__dirname, "..", "..")
    : path.resolve(__dirname, "..");

const rawArgs = process.argv.slice(2);
if (shouldShowRootHelp(rawArgs)) {
  process.stdout.write(`${ROOT_HELP}\n`);
  process.exit(0);
}

void execute({ dir: packageRoot, args: normalizeArgvAliases(rawArgs) });
