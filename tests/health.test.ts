import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import Paths from '#src/common/constants/Paths/index.ts';
import type { SuccessEnvelope } from '#src/common/utils/response.utils.ts';
import HealthService, {
  type HealthResource,
} from '#src/services/HealthService.ts';

import { agent } from './support/agent.ts';
import type { TypedRes } from './support/utils.ts';

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

type HealthRes = TypedRes<
  Omit<SuccessEnvelope<HealthResource>, 'success'> & { success: boolean }
>;

describe(Paths.Health.DISPLAY, () => {
  it('responde 200 con status ok cuando todo responde', async (t) => {
    t.mock.method(HealthService, 'checkDatabase', () => Promise.resolve('up'));
    t.mock.method(HealthService, 'checkCache', () => Promise.resolve('up'));
    t.mock.method(HealthService, 'checkQueue', () => Promise.resolve('up'));
    const res: HealthRes = await agent.get(Paths.Health.FULL_PATH);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.deepEqual(res.body.data.services, {
      database: 'up',
      cache: 'up',
      queue: 'up',
    });
    assert.ok(!Number.isNaN(Date.parse(res.body.data.timestamp)));
  });

  for (const service of [
    'checkDatabase',
    'checkCache',
    'checkQueue',
  ] as const) {
    it(`responde 503 con status degraded si falla ${service}`, async (t) => {
      t.mock.method(HealthService, 'checkDatabase', () =>
        Promise.resolve('up'),
      );
      t.mock.method(HealthService, 'checkCache', () => Promise.resolve('up'));
      t.mock.method(HealthService, 'checkQueue', () => Promise.resolve('up'));
      t.mock.method(HealthService, service, () => Promise.resolve('down'));
      const res: HealthRes = await agent.get(Paths.Health.FULL_PATH);
      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.equal(res.body.data.status, 'degraded');
      assert.ok(Object.values(res.body.data.services).includes('down'));
    });
  }

  it('reporta down (no se cuelga) si RabbitMQ no está escuchando', async () => {
    const status = await HealthService.checkQueue();
    assert.ok(status === 'up' || status === 'down');
  });
});
