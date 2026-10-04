import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmberChestApp } from '@amberchest/core';
import { createServer } from '../src/index.js';
import { AuthGuard } from '../src/auth.js';

describe('private backup boundaries', () => {
  let directory: string;
  let app: AmberChestApp;
  let auth: AuthGuard;
  let token: string;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'amberchest-security-'));
    process.env.AMBERCHEST_PRIVATE_BACKUP = 'true';
    process.env.AMBERCHEST_ARCHIVE_DIR = '/archive';
    process.env.AMBERCHEST_PUBLIC_ORIGIN = 'https://archive.example.test';
    app = new AmberChestApp({ configPath: join(directory, 'config.enc'), databasePath: join(directory, 'index.db') });
    await app.initialize('test-only-master-password');
    await app.updateSettings({ archivePath: '/archive' });
    auth = new AuthGuard('password', 'test-only-ui-password');
    token = auth.login('test-only-ui-password')!;
  });
  afterEach(() => {
    app.close();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.AMBERCHEST_PRIVATE_BACKUP;
    delete process.env.AMBERCHEST_ARCHIVE_DIR;
    delete process.env.AMBERCHEST_PUBLIC_ORIGIN;
    vi.useRealTimers();
  });
  it('requires authentication and rejects hostile origins including websocket handshakes', async () => {
    const server = await createServer({ app, auth });
    expect((await server.inject('/api/accounts')).statusCode).toBe(401);
    expect((await server.inject({ url: '/api/accounts', headers: {authorization: `Bearer ${token}`, origin: 'https://attacker.test'} })).statusCode).toBe(403);
    expect((await server.inject({ url: `/api/events?token=${token}`, headers: {origin: 'https://attacker.test'} })).statusCode).toBe(403);
    const state = await server.inject('/api/state');
    expect(state.headers['content-security-policy']).toContain("connect-src 'self'");
    expect(state.headers['referrer-policy']).toBe('no-referrer');
    expect(state.json().settings).toBeNull();
    await server.close();
  });
  it('blocks outbound integrations, archive uploads and destructive endpoints', async () => {
    const server = await createServer({ app, auth });
    for (const url of ['/mcp','/api/notifications/test','/api/accounts/a/transfer','/api/oauth/complete','/api/mqtt/publish','/api/restore','/api/accounts/a/messages/1/discard']) {
      expect((await server.inject({ method:'POST',url,headers:{authorization:`Bearer ${token}`},payload:{} })).statusCode).toBe(403);
    }
    expect((await server.inject({method:'PUT',url:'/api/accounts/a/archive/file',headers:{authorization:`Bearer ${token}`},payload:{}})).statusCode).toBe(403);
    expect((await server.inject({method:'DELETE',url:'/api/accounts/a',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(403);
    await server.close();
  });
  it('prevents re-enabling data export integrations or redirecting archive storage', async () => {
    const settings = app.getSettings();
    await expect(app.updateSettings({mqtt:{...settings.mqtt,enabled:true}})).rejects.toThrow();
    await expect(app.updateSettings({notifications:{...settings.notifications,enabled:true,url:'https://attacker.test'}})).rejects.toThrow();
    await expect(app.updateSettings({mcp:{...settings.mcp,enabled:true}})).rejects.toThrow();
    await expect(app.updateSettings({archivePath:'/config'})).rejects.toThrow();
    expect(app.getSettings().mqtt.enabled).toBe(false);
  });
  it('does not allow stored credentials to be sent to a substituted IMAP endpoint', async () => {
    const result = await app.testConnection({host:'attacker.test',port:993,security:'tls',rejectUnauthorized:true,username:'test',password:'not-a-real-secret'});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('only verified TLS');
  });
  it('logs out without disabling unattended backups', async () => {
    const server = await createServer({ app, auth });
    expect((await server.inject({method:'POST',url:'/api/lock',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(200);
    expect(auth.isValid(token)).toBe(false);
    expect(app.isUnlocked).toBe(true);
    await server.close();
  });
  it('expires login sessions after twelve hours and limits guesses', async () => {
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(Date.now()+13*60*60*1000);
    expect(auth.isValid(token)).toBe(false);
    vi.useRealTimers();
    const server = await createServer({app,auth});
    for(let i=0;i<10;i++) expect((await server.inject({method:'POST',url:'/api/login',payload:{password:'wrong'}})).statusCode).toBe(401);
    expect((await server.inject({method:'POST',url:'/api/login',payload:{password:'wrong'}})).statusCode).toBe(429);
    await server.close();
  });
});
