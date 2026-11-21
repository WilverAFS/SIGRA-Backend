import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { ErrorCodes } from '#src/common/constants/ErrorCodes.ts';
import Paths from '#src/common/constants/Paths/index.ts';
import { closeRedis } from '#src/common/infra/redis.ts';

import { agent } from './support/agent.ts';
import { assertError } from './support/utils.ts';

after(async () => {
  await closeRedis();
});

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

describe('Comportamiento transversal (cap. 2.4, 3 y 4)', () => {
  it('responde 404 RESOURCE_NOT_FOUND con la estructura estándar en rutas inexistentes', async () => {
    const res = await agent.get('/api/v1/no-existe');
    assertError(res, 404, ErrorCodes.RESOURCE_NOT_FOUND);
  });

  it('responde 400 BAD_REQUEST ante JSON mal formado', async () => {
    const res = await agent
      .post(Paths.Users.Add.FULL_PATH)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    assertError(res, 400, ErrorCodes.BAD_REQUEST);
  });

  it('responde 400 BAD_REQUEST si un POST que lo exige llega sin cuerpo', async () => {
    const res = await agent.post(Paths.Auth.Login.FULL_PATH);
    assertError(res, 400, ErrorCodes.BAD_REQUEST);
  });

  it('responde 413 PAYLOAD_TOO_LARGE ante un cuerpo demasiado grande', async () => {
    const res = await agent
      .post(Paths.Users.Add.FULL_PATH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ firstName: 'a'.repeat(110000) }));
    assertError(res, 413, ErrorCodes.PAYLOAD_TOO_LARGE);
  });

  it('genera X-Request-Id si el cliente no lo envía y respeta el suyo', async () => {
    const generated = await agent.get('/api/v1/no-existe');
    assert.match(String(generated.headers['x-request-id']), /^[0-9a-f-]{36}$/);
    const echoed = await agent
      .get('/api/v1/no-existe')
      .set('X-Request-Id', 'abc-123');
    assert.equal(echoed.headers['x-request-id'], 'abc-123');
  });

  it('envía las cabeceras de seguridad nosniff y DENY', async () => {
    const res = await agent.get('/api/v1/no-existe');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  it('permite CORS solo al origen configurado en CORS_ORIGIN', async () => {
    const allowed = await agent
      .get('/api/v1/no-existe')
      .set('Origin', 'http://localhost:5173');
    assert.equal(
      allowed.headers['access-control-allow-origin'],
      'http://localhost:5173',
    );
    const denied = await agent
      .get('/api/v1/no-existe')
      .set('Origin', 'http://evil.example.com');
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  });

  it('publica el documento OpenAPI con la seguridad Bearer', async () => {
    const res = await agent.get(Paths.Docs.JSON);
    assert.equal(res.status, 200);
    const doc = res.body as {
      paths: Record<string, unknown>;
      components: { securitySchemes: { bearerAuth: { scheme: string } } };
    };
    assert.equal(doc.components.securitySchemes.bearerAuth.scheme, 'bearer');
    for (const path of ['/health', '/users', '/users/{id}']) {
      assert.ok(doc.paths[path], `falta ${path} en Swagger`);
    }
  });

  it('sirve Swagger UI', async () => {
    const res = await agent.get(`${Paths.Docs.FULL_PATH}/`);
    assert.equal(res.status, 200);
    assert.match(res.text, /swagger-ui/i);
  });
});
