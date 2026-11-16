import assert from 'node:assert/strict';
import { buildUsageAnalytics } from './store.js';
import type { AiUsageLog } from './types.js';

const NOW = Date.parse('2026-11-11T10:00:00.000Z');

function makeLog(overrides: Partial<AiUsageLog> & { id: string; timestamp: string }): AiUsageLog {
  return {
    keyId: 'k1',
    keyName: '7Server Key',
    provider: 'copilot',
    model: 'gpt-4.1',
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    durationMs: 1000,
    status: 'success',
    statusCode: 200,
    streaming: false,
    ...overrides
  };
}

const sampleLogs: AiUsageLog[] = [
  makeLog({
    id: '1',
    timestamp: new Date(NOW - 30 * 60_000).toISOString(),
    provider: 'copilot',
    model: 'gpt-4.1',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    durationMs: 2000
  }),
  makeLog({
    id: '2',
    timestamp: new Date(NOW - 3 * 3600_000).toISOString(),
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    inputTokens: 800,
    outputTokens: 200,
    totalTokens: 1000,
    durationMs: 1200,
    status: 'error',
    statusCode: 429
  }),
  makeLog({
    id: '3',
    timestamp: new Date(NOW - 5 * 86400_000).toISOString(),
    provider: 'copilot',
    model: 'gpt-4.1',
    inputTokens: 2000,
    outputTokens: 1000,
    totalTokens: 3000,
    durationMs: 1600
  }),
  makeLog({
    id: '4',
    timestamp: new Date(NOW - 200 * 86400_000).toISOString(),
    provider: 'openai',
    model: 'gpt-5',
    inputTokens: 4000,
    outputTokens: 1000,
    totalTokens: 5000,
    durationMs: 3000
  })
];

// 1. Today / 1d hourly breakdown
const dayAnalytics = buildUsageAnalytics(sampleLogs, '1d', { nowMs: NOW, tzOffsetMin: -420 });
assert.equal(dayAnalytics.range, '1d');
assert.equal(dayAnalytics.series.length, 24);
assert.match(dayAnalytics.series[0].bucket, /^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
assert.equal(dayAnalytics.summary.requests, 2);
assert.equal(dayAnalytics.summary.errorCount, 1);
assert.equal(dayAnalytics.summary.successRate, 50);
assert.equal(dayAnalytics.summary.totalTokens, 2500);
assert.equal(dayAnalytics.summary.avgDurationMs, 1600);
assert.equal(dayAnalytics.byModel[0].key, 'gpt-4.1');
assert.equal(dayAnalytics.byModel[0].sharePct, 60);
assert.equal(dayAnalytics.byProvider.length, 2);
// WIB UTC+7 at 10:00Z is 17:xx local
assert.equal(dayAnalytics.series[dayAnalytics.series.length - 1].label, '17:00');

// 2. 30d daily breakdown (excludes 200d-old log)
const monthAnalytics = buildUsageAnalytics(sampleLogs, '30d', { nowMs: NOW, tzOffsetMin: 0 });
assert.equal(monthAnalytics.range, '30d');
assert.equal(monthAnalytics.series.length, 30);
assert.match(monthAnalytics.series[0].bucket, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(monthAnalytics.summary.requests, 3);
assert.equal(monthAnalytics.summary.totalTokens, 5500);
assert.equal(monthAnalytics.byModel[0].key, 'gpt-4.1');
assert.equal(monthAnalytics.byModel[0].requests, 2);
assert.equal(monthAnalytics.byModel[0].totalTokens, 4500);
assert.equal(monthAnalytics.byModel[0].provider, 'copilot');
assert.equal(monthAnalytics.byProvider[0].key, 'copilot');

// 3. All time breakdown (200d span -> monthly buckets, includes all 4 logs)
const allAnalytics = buildUsageAnalytics(sampleLogs, 'all', { nowMs: NOW, tzOffsetMin: 0 });
assert.equal(allAnalytics.range, 'all');
assert.match(allAnalytics.series[0].bucket, /^\d{4}-\d{2}$/);
assert.equal(allAnalytics.summary.requests, 4);
assert.equal(allAnalytics.summary.totalTokens, 10500);
assert.equal(allAnalytics.byProvider.length, 3);
assert.equal(allAnalytics.byModel[0].key, 'gpt-5');

// 4. Cross-filtering by provider & model
const filteredProvider = buildUsageAnalytics(sampleLogs, 'all', { nowMs: NOW, provider: 'anthropic' });
assert.equal(filteredProvider.summary.requests, 1);
assert.equal(filteredProvider.byModel[0].key, 'claude-sonnet-4-6');
assert.equal(filteredProvider.byModel[0].errors, 1);

const filteredModel = buildUsageAnalytics(sampleLogs, '30d', { nowMs: NOW, model: 'gpt-4.1' });
assert.equal(filteredModel.summary.requests, 2);
assert.equal(filteredModel.summary.totalTokens, 4500);

// 5. Empty dataset
const empty = buildUsageAnalytics([], '7d', { nowMs: NOW });
assert.equal(empty.range, '7d');
assert.equal(empty.series.length, 7);
assert.equal(empty.summary.requests, 0);
assert.equal(empty.summary.successRate, 100);
assert.equal(empty.summary.costUsd, 0);
assert.deepEqual(empty.byModel, []);
assert.deepEqual(empty.byProvider, []);
assert.deepEqual(empty.byKey, []);

// 6. Cost calculation & per-key filter / breakdown
const multiKeyLogs: AiUsageLog[] = [
  makeLog({ id: 'mk1', timestamp: new Date(NOW - 60_000).toISOString(), keyId: 'key-a', keyName: 'CLI Key', model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 }),
  makeLog({ id: 'mk2', timestamp: new Date(NOW - 60_000).toISOString(), keyId: 'key-b', keyName: 'Bot Key', model: 'gpt-4o-mini', inputTokens: 1_000_000, outputTokens: 1_000_000 })
];
const mkAll = buildUsageAnalytics(multiKeyLogs, '1d', { nowMs: NOW });
assert.equal(mkAll.summary.costUsd, 2.5 + 0.15 + 0.6);
assert.equal(mkAll.byKey.length, 2);
const mkFiltered = buildUsageAnalytics(multiKeyLogs, '1d', { nowMs: NOW, keyId: 'key-b' });
assert.equal(mkFiltered.summary.requests, 1);
assert.equal(mkFiltered.byKey[0].label, 'Bot Key');
assert.equal(mkFiltered.summary.costUsd, 0.75);

console.log('analytics ok');
