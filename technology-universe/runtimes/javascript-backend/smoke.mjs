import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const R = {};
const t = async (n, fn) => { try { await fn(); R[n] = 'PASS'; } catch (e) { R[n] = `FAIL ${e.constructor.name}: ${e.message}`; } };

await t('express', async () => {
  const express = require('express');
  const app = express();
  app.get('/h', (req, res) => res.json({ ok: true }));
  const routes = app.router.stack.filter(l => l.route).map(l => l.route.path);
  if (!routes.includes('/h')) throw new Error('route not registered: ' + JSON.stringify(routes));
  let out; const res = { json: v => { out = v; } };
  app.router.stack.find(l => l.route && l.route.path === '/h').route.stack[0].handle({}, res, () => {});
  if (out.ok !== true) throw new Error('handler did not run');           // no socket bound
});
await t('fastify', async () => {
  const Fastify = require('fastify');
  const app = Fastify();
  app.get('/h', async () => ({ ok: true }));
  const r = await app.inject({ method: 'GET', url: '/h' });              // in-process, no socket
  if (r.statusCode !== 200 || JSON.parse(r.body).ok !== true) throw new Error(r.body);
  await app.close();
});
await t('hono', async () => {
  const { Hono } = await import('hono');
  const app = new Hono();
  app.get('/h', c => c.json({ ok: true }));
  const r = await app.request('/h');                                     // Fetch API, no socket
  if (r.status !== 200 || (await r.json()).ok !== true) throw new Error('bad response');
});
await t('nestjs', async () => {
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { Module, Injectable } = require('@nestjs/common');
  class Svc { hi() { return 42; } }
  Injectable()(Svc);
  class AppModule {}
  Module({ providers: [Svc] })(AppModule);
  const app = await NestFactory.create(AppModule, { logger: false });    // created, never .listen()
  if (app.get(Svc).hi() !== 42) throw new Error('DI container did not resolve provider');
  await app.close();
});
await t('graphql-yoga', async () => {
  const { createYoga, createSchema } = require('graphql-yoga');
  const yoga = createYoga({ schema: createSchema({ typeDefs: 'type Query { ok: Boolean }', resolvers: { Query: { ok: () => true } } }), logging: false });
  const r = await yoga.fetch('http://x/graphql?query=%7Bok%7D', { headers: { accept: 'application/json' } });
  const j = await r.json();
  if (j?.data?.ok !== true) throw new Error(JSON.stringify(j));          // no socket
});
await t('apollo-server', async () => {
  const { ApolloServer } = require('@apollo/server');
  const s = new ApolloServer({ typeDefs: 'type Query { ok: Boolean }', resolvers: { Query: { ok: () => true } } });
  await s.start();                                                       // no HTTP listener
  const r = await s.executeOperation({ query: '{ ok }' });
  if (r.body.singleResult.data.ok !== true) throw new Error(JSON.stringify(r.body));
  await s.stop();
});
await t('trpc', async () => {
  const { initTRPC } = require('@trpc/server');
  const trpc = initTRPC.create();
  const router = trpc.router({ ok: trpc.procedure.query(() => true) });
  const caller = trpc.createCallerFactory(router)({});
  if ((await caller.ok()) !== true) throw new Error('caller failed');
});
await t('connectrpc', async () => {
  const m = await import('@connectrpc/connect');
  const e = new m.ConnectError('nope', m.Code.NotFound);
  if (m.Code[e.code] !== 'NotFound') throw new Error('code mismatch');
});
await t('socket.io', async () => {
  const { Server } = require('socket.io');
  const io = new Server();                                               // no httpServer attached
  if (typeof io.of('/').on !== 'function') throw new Error('no namespace');
  io.close();
});
await t('socket.io-client', async () => {
  const c = require('socket.io-client');
  if (typeof c.io !== 'function' || typeof c.Manager !== 'function') throw new Error('missing exports');
});
await t('yjs', async () => {
  const Y = await import('yjs');
  const a = new Y.Doc(), b = new Y.Doc();
  a.getText('t').insert(0, 'hel'); b.getText('t').insert(0, 'lo');
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  if (a.getText('t').toString() !== b.getText('t').toString()) throw new Error('CRDT did not converge');
});
await t('automerge', async () => {
  const A = await import('@automerge/automerge');
  let d1 = A.from({ n: [1] });
  let d2 = A.clone(d1);
  d1 = A.change(d1, d => d.n.push(2));
  d2 = A.change(d2, d => d.n.push(3));
  const m = A.merge(d1, d2);
  if (m.n.length !== 3) throw new Error('merge lost data: ' + JSON.stringify(m));
});
await t('hocuspocus', async () => {
  const m = await import('@hocuspocus/server');
  const s = m.Server.configure({ port: 0, quiet: true });                // configured, never .listen()
  if (!s) throw new Error('configure returned nothing');
});
await t('bullmq', async () => {
  const m = require('bullmq');
  for (const k of ['Queue', 'Worker', 'QueueEvents', 'FlowProducer'])
    if (typeof m[k] !== 'function') throw new Error('missing ' + k);     // no Redis connection opened
});
await t('bull', async () => {
  const Q = require('bull');
  if (typeof Q !== 'function' || typeof Q.prototype.add !== 'function') throw new Error('bad export');
});
await t('passport', async () => {
  const passport = require('passport');
  const p = new passport.Passport();
  class S { constructor(){ this.name='s'; } authenticate(){ this.success({ id: 1 }); } }
  p.use('s', new S());
  if (typeof p.authenticate('s') !== 'function') throw new Error('no middleware');
});
await t('auth.js (@auth/core)', async () => {
  const m = await import('@auth/core');
  if (typeof m.Auth !== 'function') throw new Error('Auth export missing');
});
await t('better-auth', async () => {
  const m = await import('better-auth');
  if (typeof m.betterAuth !== 'function') throw new Error('betterAuth export missing');
});
await t('swagger-ui-dist', async () => {
  const { getAbsoluteFSPath } = require('swagger-ui-dist');
  const p = getAbsoluteFSPath();
  if (!fs.existsSync(p + '/swagger-ui-bundle.js')) throw new Error('bundle missing at ' + p);
});
await t('redoc', async () => {
  const p = require.resolve('redoc/package.json').replace(/package\.json$/, '');
  const f = ['bundles/redoc.standalone.js', 'bundles/redoc.browser.lib.js'].find(x => fs.existsSync(p + x));
  if (!f) throw new Error('no browser bundle found under ' + p + 'bundles/');
  if (fs.statSync(p + f).size < 100000) throw new Error('bundle implausibly small');
});
await t('@scalar/api-reference', async () => {
  const p = require.resolve('@scalar/api-reference/package.json').replace(/package\.json$/, '');
  if (!fs.existsSync(p + 'dist')) throw new Error('no dist/ under ' + p);
  if (fs.readdirSync(p + 'dist').length === 0) throw new Error('dist/ is empty');
});
for (const [k, v] of Object.entries(R)) console.log(`${k}: ${v}`);
console.log('PASS:', Object.values(R).filter(v => v === 'PASS').length, '/', Object.keys(R).length);
