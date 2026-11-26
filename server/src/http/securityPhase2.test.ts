// Tests for Cookies, CSRF, and Hybrid Auth
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookies, getSessionCookieOptions } from './cookies.js';
import { csrfOriginCheck } from './csrf.js';

test('Cookie parser splits multiple cookies properly', () => {
  const header = '7s_sid=abcdef12345; theme=dark; other=hello%20world';
  const cookies = parseCookies(header);
  assert.equal(cookies['7s_sid'], 'abcdef12345');
  assert.equal(cookies['theme'], 'dark');
  assert.equal(cookies['other'], 'hello world');
});

test('Session cookie options dynamic secure attribute', () => {
  // Plain HTTP request (e.g. LAN 192.168.1.5 or localhost without TLS)
  const reqHttp = { secure: false } as any;
  const optHttp = getSessionCookieOptions(reqHttp);
  assert.equal(optHttp.httpOnly, true);
  assert.equal(optHttp.secure, false);
  assert.equal(optHttp.sameSite, 'lax');

  // HTTPS request (behind TLS reverse proxy with X-Forwarded-Proto)
  const reqHttps = { secure: true } as any;
  const optHttps = getSessionCookieOptions(reqHttps);
  assert.equal(optHttps.secure, true);
});

test('CSRF middleware allows safe GET and Bearer requests', () => {
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  // GET is always safe
  csrfOriginCheck({ method: 'GET', headers: {}, path: '/api/servers' } as any, {} as any, next);
  assert.equal(nextCalled, true);

  // POST with Bearer token is exempt
  nextCalled = false;
  csrfOriginCheck({
    method: 'POST',
    headers: { authorization: 'Bearer token123' },
    path: '/api/servers'
  } as any, {} as any, next);
  assert.equal(nextCalled, true);
});

test('CSRF middleware blocks state-changing request with mismatched Origin', () => {
  let statusResult = 0;
  let jsonResult: any = null;
  const res = {
    status(code: number) {
      statusResult = code;
      return this;
    },
    json(data: any) {
      jsonResult = data;
      return this;
    }
  } as any;

  const req = {
    method: 'POST',
    headers: {
      origin: 'https://malicious-website.com',
      host: 'panel.myserver.com'
    },
    path: '/api/servers'
  } as any;

  let nextCalled = false;
  csrfOriginCheck(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(statusResult, 403);
  assert.equal(jsonResult?.code, 'CSRF_BLOCKED');
});
