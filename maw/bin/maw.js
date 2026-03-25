#!/usr/bin/env node

/**
 * Multi-AI Workflow (MAW) CLI Entry Point
 *
 * This is the main entry point for the MAW command line interface.
 * It loads the CLI module and executes with the provided arguments.
 */

import { run } from '../dist/src/cli.js';

run(process.argv);
