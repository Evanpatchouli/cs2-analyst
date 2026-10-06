import { analyzeDemoFile } from './report.js';

// The native parser reads the Main-selected file here, in a separate OS process.
process.parentPort?.once('message', async ({ data }: { data: { filePath: string } }) => {
  const result = await analyzeDemoFile(data.filePath, () => process.parentPort?.postMessage({ kind: 'progress', phase: 'analyzing' }));
  process.parentPort?.postMessage(result);
});
