#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { TestEngineOrchestrator } from './orchestrator.js';

const program = new Command();

program
  .name('auto-test')
  .description('Dynamic Auto Testing Platform CLI Runner')
  .version('1.0.0')
  .requiredOption('-p, --project <id>', 'Project ID or project directory path')
  .option('-e, --env <environment>', 'Target environment override (e.g. local, staging, prod)')
  .option('-t, --type <type>', 'Filter test type (ui, api, visual, all)', 'all')
  .option('--test <testId>', 'Run specific test case ID')
  .option('--tags <tags>', 'Filter by comma-separated tags')
  .option('--headed', 'Run browser in headed mode', false)
  .option('--dir <projectsDir>', 'Root directory containing projects', './projects')
  .action(async (opts) => {
    try {
      console.log(pc.cyan(`\n======================================================`));
      console.log(pc.bold(pc.cyan(` 🚀 Dynamic Auto Testing Platform — CLI Runner`)));
      console.log(pc.cyan(`======================================================\n`));

      // Resolve project directory
      let projectDir = path.resolve(opts.project);
      if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
        // Try looking inside projectsDir
        projectDir = path.resolve(opts.dir, opts.project);
      }

      if (!fs.existsSync(projectDir)) {
        console.error(pc.red(`❌ Error: Project directory not found at: ${projectDir}`));
        process.exit(1);
      }

      const configPath = path.join(projectDir, 'project.config.json');
      if (!fs.existsSync(configPath)) {
        console.error(pc.red(`❌ Error: project.config.json not found in ${projectDir}`));
        process.exit(1);
      }

      console.log(pc.white(`📁 Project Directory : `) + pc.yellow(projectDir));
      console.log(pc.white(`🌐 Target Environment: `) + pc.magenta(opts.env || 'default (config)'));
      console.log(pc.white(`🔍 Filter Type       : `) + pc.blue(opts.type));
      if (opts.test) console.log(pc.white(`🎯 Specific Test     : `) + pc.yellow(opts.test));
      console.log(pc.white(`🖥️  Browser Mode      : `) + (opts.headed ? pc.green('HEADED') : pc.gray('HEADLESS')));
      console.log('');

      const orchestrator = new TestEngineOrchestrator();

      // Handle SIGINT for graceful shutdown
      process.on('SIGINT', () => {
        console.log(pc.yellow('\n⚠️  Execution interrupted by user. Finalizing reports...'));
        orchestrator.cancel();
      });

      const summary = await orchestrator.run({
        projectDir,
        environment: opts.env,
        typeFilter: opts.type as any,
        testCaseIds: opts.test ? [opts.test] : undefined,
        tagFilter: opts.tags ? opts.tags.split(',').map((s: string) => s.trim()) : undefined,
        headless: !opts.headed,
        cliCommand: `npm run test:cli -- --project=${opts.project}${opts.env ? ` --env=${opts.env}` : ''}`,
        onEvent: (event) => {
          switch (event.type) {
            case 'RUN_STARTED':
              console.log(pc.bold(pc.blue(`▶️  Starting execution: ${event.payload.totalTests} tests to run [Run ID: ${event.payload.runId}]\n`)));
              break;
            case 'TEST_STARTED': {
              const { current, total, testId, name, testType } = event.payload;
              const typeBadge = pc.inverse(` ${testType.toUpperCase()} `);
              console.log(`${pc.gray(`[${current}/${total}]`)} ${typeBadge} ${pc.bold(name)} ${pc.gray(`(${testId})`)}`);
              break;
            }
            case 'STEP_PROGRESS': {
              const { step } = event.payload;
              const icon = step.status === 'PASS' ? pc.green('  ✔') : pc.red('  ✖');
              const dur = pc.gray(`${step.durationMs}ms`);
              console.log(`${icon} Step ${step.index}: ${step.name} (${dur})`);
              if (step.error) {
                console.log(pc.red(`     └─ Error: ${step.error}`));
              }
              break;
            }
            case 'TEST_COMPLETED': {
              const { result } = event.payload;
              const icon = result.status === 'PASS' ? pc.bold(pc.green('✔ PASS')) : pc.bold(pc.red('✖ FAIL'));
              const dur = pc.gray(`${(result.durationMs / 1000).toFixed(2)}s`);
              console.log(`${icon} ${result.name} in ${dur}\n`);
              break;
            }
          }
        }
      });

      // Print Summary Table
      console.log(pc.cyan(`------------------------------------------------------`));
      console.log(pc.bold(` Execution Summary: ${summary.projectName}`));
      console.log(pc.cyan(`------------------------------------------------------`));
      console.log(` Status       : ${summary.status === 'PASS' ? pc.bold(pc.green('PASS')) : pc.bold(pc.red('FAIL'))}`);
      console.log(` Total Tests  : ${summary.counts.total}`);
      console.log(` Passed       : ${pc.green(summary.counts.pass)}`);
      console.log(` Failed       : ${pc.red(summary.counts.fail)}`);
      console.log(` Skipped      : ${pc.yellow(summary.counts.skip)}`);
      console.log(` Duration     : ${pc.white((summary.durationMs / 1000).toFixed(2))}s`);
      console.log(` Reports Path : ${pc.underline(path.join(projectDir, 'reports', summary.runId))}`);
      console.log(pc.cyan(`------------------------------------------------------\n`));

      if (summary.status === 'PASS') {
        console.log(pc.bold(pc.green(`🎉 All tests passed successfully!\n`)));
        process.exit(0);
      } else {
        console.error(pc.bold(pc.red(`❌ Some tests failed. Check reports for details.\n`)));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(pc.bold(pc.red(`\n💥 Fatal execution error: ${err.message}`)));
      if (err.stack) {
        console.error(pc.gray(err.stack));
      }
      process.exit(1);
    }
  });

program.parse();
