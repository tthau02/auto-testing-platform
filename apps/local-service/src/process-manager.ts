import { EventEmitter } from 'node:events';
import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { ExecutionEvent } from '@auto-test/test-engine';
import { TestRunSummary } from '@auto-test/test-case-schema';

export interface ActiveRun {
  runId: string;
  projectId: string;
  process?: ChildProcess;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
  events: ExecutionEvent[];
  summary?: TestRunSummary;
  error?: string;
  emitter: EventEmitter;
  startedAt: string;
}

export class RunProcessManager {
  private activeRuns: Map<string, ActiveRun> = new Map();

  createRun(runId: string, projectId: string): ActiveRun {
    const run: ActiveRun = {
      runId,
      projectId,
      status: 'PENDING',
      events: [],
      emitter: new EventEmitter(),
      startedAt: new Date().toISOString()
    };
    // Keep max 100 listeners
    run.emitter.setMaxListeners(100);
    this.activeRuns.set(runId, run);
    return run;
  }

  getRun(runId: string): ActiveRun | undefined {
    return this.activeRuns.get(runId);
  }

  getAllRuns(): ActiveRun[] {
    return Array.from(this.activeRuns.values());
  }

  emitEvent(runId: string, event: ExecutionEvent): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    run.events.push(event);
    run.emitter.emit('event', event);

    if (event.type === 'RUN_STARTED') {
      run.status = 'RUNNING';
    } else if (event.type === 'RUN_COMPLETED') {
      run.status = event.payload.summary.status === 'CANCELLED'
        ? 'CANCELLED'
        : event.payload.summary.status === 'PASS' ? 'COMPLETED' : 'ERROR';
      run.summary = event.payload.summary;
    }
  }

  stopRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;

    if (run.process && !run.process.killed) {
      run.process.kill('SIGINT');
      run.status = 'CANCELLED';
      return true;
    }
    return false;
  }
}

export const processManager = new RunProcessManager();
