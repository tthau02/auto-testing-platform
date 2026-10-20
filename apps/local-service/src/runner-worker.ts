import { TestEngineOrchestrator, ExecutionOptions } from '@auto-test/test-engine';

process.on('message', async (options: ExecutionOptions) => {
  const orchestrator = new TestEngineOrchestrator();

  process.on('SIGINT', () => {
    orchestrator.cancel();
  });

  try {
    const summary = await orchestrator.run({
      ...options,
      onEvent: (event) => {
        if (process.send) {
          process.send({ type: 'EVENT', payload: event });
        }
      }
    });

    if (process.send) {
      process.send({ type: 'DONE', summary });
    }
    process.exit(summary.status === 'PASS' ? 0 : 1);
  } catch (err: any) {
    if (process.send) {
      process.send({ type: 'ERROR', error: err.message, stack: err.stack });
    }
    process.exit(1);
  }
});
