#!/usr/bin/env npx tsx
/**
 * SCRUM MCP v0.3 vs v0.4 Compliance Benchmark
 *
 * Measures:
 * 1. Latency overhead of compliance checks
 * 2. Rejection rate under different scenarios
 * 3. Workflow completion time
 */

const BASE_URL = process.env.SCRUM_URL || 'http://localhost:4177';

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  rejectionRate: number;
  details?: string;
}

async function fetch(url: string, options?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, options);
}

async function api(method: string, path: string, body?: object): Promise<{ ok: boolean; data?: any; latencyMs: number }> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const latencyMs = performance.now() - start;
  const json = await res.json();
  return { ok: json.ok, data: json.data, latencyMs };
}

// ==================== BENCHMARKS ====================

async function benchmarkComplianceCheck(iterations: number): Promise<BenchmarkResult> {
  const latencies: number[] = [];

  // Create a task with full workflow
  const task = await api('POST', '/api/tasks', { title: 'Bench task', description: 'For benchmarking' });
  const taskId = task.data.id;

  await api('POST', '/api/intents', {
    taskId,
    agentId: 'bench-agent',
    files: ['src/bench.ts'],
    acceptanceCriteria: 'Benchmark completed successfully'
  });

  await api('POST', '/api/changelog', {
    taskId,
    agentId: 'bench-agent',
    filePath: 'src/bench.ts',
    changeType: 'modify',
    summary: 'Benchmark change'
  });

  await api('POST', '/api/evidence', {
    taskId,
    agentId: 'bench-agent',
    command: 'npm test',
    output: 'pass'
  });

  // Benchmark compliance check
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await api('GET', `/api/compliance/${taskId}/bench-agent`);
    latencies.push(performance.now() - start);
  }

  return {
    name: 'Compliance Check (GET /api/compliance/:taskId/:agentId)',
    iterations,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    rejectionRate: 0,
    details: 'Pure read operation, no enforcement'
  };
}

async function benchmarkClaimReleaseCompliant(iterations: number): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let rejections = 0;
  const timestamp = Date.now();

  for (let i = 0; i < iterations; i++) {
    const agentId = `bench-compliant-${timestamp}-${i}`;
    const file = `src/compliant-${timestamp}-${i}.ts`;

    // Create compliant workflow
    const task = await api('POST', '/api/tasks', { title: `Compliant ${i}` });
    const taskId = task.data.id;

    await api('POST', '/api/intents', {
      taskId,
      agentId,
      files: [file],
      acceptanceCriteria: 'File modified correctly'
    });

    await api('POST', '/api/claims', { agentId, files: [file] });

    await api('POST', '/api/changelog', {
      taskId,
      agentId,
      filePath: file,
      changeType: 'modify',
      summary: 'Modified'
    });

    await api('POST', '/api/evidence', {
      taskId,
      agentId,
      command: 'npm test',
      output: 'pass'
    });

    // Benchmark claim release (with compliance check)
    const start = performance.now();
    const result = await api('DELETE', '/api/claims', { agentId });
    latencies.push(performance.now() - start);

    if (!result.ok) rejections++;
  }

  return {
    name: 'Claim Release (COMPLIANT workflow)',
    iterations,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    rejectionRate: rejections / iterations,
    details: 'v0.4 runs compliance check before release'
  };
}

async function benchmarkClaimReleaseNonCompliant(iterations: number): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let rejections = 0;
  const timestamp = Date.now();

  for (let i = 0; i < iterations; i++) {
    const agentId = `bench-noncompliant-${timestamp}-${i}`;
    const declaredFile = `src/declared-${timestamp}-${i}.ts`;
    const undeclaredFile = `src/undeclared-${timestamp}-${i}.ts`;

    // Create NON-compliant workflow (undeclared file)
    const task = await api('POST', '/api/tasks', { title: `NonCompliant ${i}` });
    const taskId = task.data.id;

    await api('POST', '/api/intents', {
      taskId,
      agentId,
      files: [declaredFile],
      acceptanceCriteria: 'Only modify declared file'
    });

    await api('POST', '/api/claims', { agentId, files: [declaredFile] });

    // Log change to UNDECLARED file (violation!)
    await api('POST', '/api/changelog', {
      taskId,
      agentId,
      filePath: undeclaredFile,
      changeType: 'modify',
      summary: 'Oops wrong file'
    });

    await api('POST', '/api/evidence', {
      taskId,
      agentId,
      command: 'npm test',
      output: 'pass'
    });

    // Benchmark claim release (should be REJECTED)
    const start = performance.now();
    const result = await api('DELETE', '/api/claims', { agentId });
    latencies.push(performance.now() - start);

    if (!result.ok) rejections++;
  }

  return {
    name: 'Claim Release (NON-COMPLIANT - undeclared file)',
    iterations,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    rejectionRate: rejections / iterations,
    details: 'v0.4 should reject 100% - this is the POINT of the feature'
  };
}

async function benchmarkTaskUpdateToDone(iterations: number): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let rejections = 0;

  for (let i = 0; i < iterations; i++) {
    const agentId = `bench-done-${i}`;

    // Create compliant workflow
    const task = await api('POST', '/api/tasks', { title: `Done ${i}` });
    const taskId = task.data.id;

    await api('POST', '/api/intents', {
      taskId,
      agentId,
      files: ['src/done.ts'],
      acceptanceCriteria: 'Complete the task'
    });

    await api('POST', '/api/changelog', {
      taskId,
      agentId,
      filePath: 'src/done.ts',
      changeType: 'modify',
      summary: 'Done'
    });

    await api('POST', '/api/evidence', {
      taskId,
      agentId,
      command: 'npm test',
      output: 'pass'
    });

    // Set to in_progress first
    await api('PATCH', `/api/tasks/${taskId}`, { status: 'in_progress' });

    // Benchmark task update to done (with compliance check)
    const start = performance.now();
    const result = await api('PATCH', `/api/tasks/${taskId}`, { status: 'done' });
    latencies.push(performance.now() - start);

    if (!result.ok) rejections++;
  }

  return {
    name: 'Task Update to Done (COMPLIANT)',
    iterations,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    rejectionRate: rejections / iterations,
    details: 'v0.4 runs compliance check for all agents on task'
  };
}

async function benchmarkBaselineOperations(iterations: number): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Task create (no compliance overhead)
  const taskLatencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await api('POST', '/api/tasks', { title: `Baseline ${i}` });
    taskLatencies.push(performance.now() - start);
  }
  results.push({
    name: 'Task Create (baseline, no compliance)',
    iterations,
    avgLatencyMs: taskLatencies.reduce((a, b) => a + b, 0) / taskLatencies.length,
    minLatencyMs: Math.min(...taskLatencies),
    maxLatencyMs: Math.max(...taskLatencies),
    rejectionRate: 0
  });

  // Intent post (no compliance overhead)
  const task = await api('POST', '/api/tasks', { title: 'Intent baseline' });
  const intentLatencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await api('POST', '/api/intents', {
      taskId: task.data.id,
      agentId: `baseline-${i}`,
      files: ['src/base.ts'],
      acceptanceCriteria: 'Baseline test operation'
    });
    intentLatencies.push(performance.now() - start);
  }
  results.push({
    name: 'Intent Post (baseline, no compliance)',
    iterations,
    avgLatencyMs: intentLatencies.reduce((a, b) => a + b, 0) / intentLatencies.length,
    minLatencyMs: Math.min(...intentLatencies),
    maxLatencyMs: Math.max(...intentLatencies),
    rejectionRate: 0
  });

  return results;
}

// ==================== MAIN ====================

async function main() {
  console.log('='.repeat(70));
  console.log('SCRUM MCP v0.3 vs v0.4 Compliance Benchmark');
  console.log('='.repeat(70));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  const iterations = 10;
  const results: BenchmarkResult[] = [];

  console.log(`Running ${iterations} iterations per benchmark...\n`);

  // Baseline (v0.3 equivalent - no compliance overhead)
  console.log('📊 Baseline Operations (no compliance)...');
  results.push(...await benchmarkBaselineOperations(iterations));

  // Compliance check
  console.log('📊 Compliance Check...');
  results.push(await benchmarkComplianceCheck(iterations));

  // Claim release - compliant
  console.log('📊 Claim Release (compliant)...');
  results.push(await benchmarkClaimReleaseCompliant(iterations));

  // Claim release - non-compliant
  console.log('📊 Claim Release (non-compliant)...');
  results.push(await benchmarkClaimReleaseNonCompliant(iterations));

  // Task update to done
  console.log('📊 Task Update to Done...');
  results.push(await benchmarkTaskUpdateToDone(iterations));

  // Results
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));

  for (const r of results) {
    console.log(`\n${r.name}`);
    console.log(`  Avg: ${r.avgLatencyMs.toFixed(2)}ms | Min: ${r.minLatencyMs.toFixed(2)}ms | Max: ${r.maxLatencyMs.toFixed(2)}ms`);
    console.log(`  Rejection Rate: ${(r.rejectionRate * 100).toFixed(1)}%`);
    if (r.details) console.log(`  Note: ${r.details}`);
  }

  // Analysis
  console.log('\n' + '='.repeat(70));
  console.log('ANALYSIS');
  console.log('='.repeat(70));

  const baseline = results.find(r => r.name.includes('Task Create'))!;
  const complianceCheck = results.find(r => r.name.includes('Compliance Check'))!;
  const claimCompliant = results.find(r => r.name.includes('COMPLIANT workflow'))!;
  const claimNonCompliant = results.find(r => r.name.includes('NON-COMPLIANT'))!;

  console.log(`
📈 Latency Overhead:
   - Compliance check adds ~${complianceCheck.avgLatencyMs.toFixed(1)}ms per call
   - Claim release (compliant) adds ~${(claimCompliant.avgLatencyMs - baseline.avgLatencyMs).toFixed(1)}ms vs baseline
   - This is ${complianceCheck.avgLatencyMs < 10 ? 'NEGLIGIBLE' : complianceCheck.avgLatencyMs < 50 ? 'ACCEPTABLE' : 'CONCERNING'}

🛡️ Enforcement Value:
   - Non-compliant claim release rejection rate: ${(claimNonCompliant.rejectionRate * 100).toFixed(0)}%
   - ${claimNonCompliant.rejectionRate === 1 ? '✅ WORKING - Bad workflows are blocked' : '⚠️ ISSUE - Non-compliant workflows should be rejected'}

⚖️ Tradeoff Assessment:
   - Cost: ~${complianceCheck.avgLatencyMs.toFixed(0)}ms additional latency on claim release and task completion
   - Benefit: Catches scope creep, boundary violations, missing evidence BEFORE merge
   - Verdict: ${complianceCheck.avgLatencyMs < 20 ? 'WORTH IT - minimal overhead, high value' : 'CONSIDER CACHING'}
`);

  // Recommendations
  console.log('='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (complianceCheck.avgLatencyMs < 20) {
    console.log(`
✅ No changes needed. The compliance overhead is minimal (<20ms).

The v0.4 compliance feature:
- Adds ~${complianceCheck.avgLatencyMs.toFixed(0)}ms to claim release and task completion
- Successfully blocks ${(claimNonCompliant.rejectionRate * 100).toFixed(0)}% of non-compliant workflows
- This is a NET POSITIVE for agent quality

Agents work better when they know their work will be verified.
`);
  } else if (complianceCheck.avgLatencyMs < 100) {
    console.log(`
⚠️ Consider optional optimizations:

1. Cache compliance results for 5-10 seconds
2. Make compliance check async (non-blocking) with webhook notification
3. Add "soft mode" that warns but doesn't block
`);
  } else {
    console.log(`
🚨 Compliance overhead is high (${complianceCheck.avgLatencyMs.toFixed(0)}ms). Consider:

1. Index optimization on changelog/intents tables
2. Lazy evaluation - only check what's needed
3. Background compliance worker
`);
  }
}

main().catch(console.error);
