#!/usr/bin/env node
import { runFlick } from "./runner";

const [, , command, file] = process.argv;

// Show help if no arguments or wrong command
if (!command || command === "--help" || command === "help") {
    console.log(`
Flick CLI

Usage:
  flick run <file.fk>     Run a Flick source file
  flick --help            Show this help

Examples:
  flick run test.fk
`);
    process.exit(0);
}

// Only allow "run"
if (command === "run" && file) {
    runFlick(file);
} else {
    console.log(`
Error: Unknown usage.

Usage:
  flick run <file.fk>
  flick --help
`);
    process.exit(1);
}
