import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  checkUser: vi.fn(),
  createUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
}));

vi.mock('@/db/userAction', () => ({ checkUser: mocks.checkUser }));
vi.mock('@/db/client', () => ({
  default: { user: { create: mocks.createUser } },
}));
vi.mock('@/utils/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/auth')>();
  return {
    ...original,
    hashPassword: mocks.hashPassword,
    verifyPassword: mocks.verifyPassword,
  };
});
vi.mock('@/lib/jwt', () => ({ generateToken: mocks.generateToken }));
vi.mock('@/lib/logger/Logger', () => ({
  default: { error: vi.fn() },
}));

import { POST as register } from './register/route';
import { POST as login } from './login/route';

function request(path: string, body: object) {
  return new NextRequest(`http://localhost/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedRequest(path: string) {
  return new NextRequest(`http://localhost/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });
}

describe('authentication route errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue('hashed-password');
    mocks.generateToken.mockReturnValue('token');
  });

  it('rejects an invalid registration email before querying the database', async () => {
    const response = await register(
      request('register', {
        email: 'not-an-email',
        username: 'new-user',
        password: 'Password1',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: true,
      message: '邮箱格式不正确',
    });
    expect(mocks.checkUser).not.toHaveBeenCalled();
  });

  it('registers a new email when the user query returns null', async () => {
    mocks.checkUser.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      username: 'new-user',
      role: 'USER',
      avatar: null,
    });

    const response = await register(
      request('register', {
        email: 'new@example.com',
        username: 'new-user',
        password: 'Password1',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      error: false,
      message: '注册成功',
    });
    expect(mocks.createUser).toHaveBeenCalledOnce();
  });

  it('returns a clear login error for an unknown email', async () => {
    mocks.checkUser.mockResolvedValue(null);

    const response = await login(
      request('login', {
        email: 'missing@example.com',
        password: 'Password1',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: true,
      message: '邮箱或密码不正确',
    });
  });

  it.each([
    ['register', register],
    ['login', login],
  ] as const)('returns 400 for malformed JSON on %s', async (path, handler) => {
    const response = await handler(malformedRequest(path));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: true,
      message: '请求内容不是有效的 JSON',
    });
    expect(mocks.checkUser).not.toHaveBeenCalled();
  });

  it('normalizes registration identity fields before persistence', async () => {
    mocks.checkUser.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      username: 'new-user',
      role: 'USER',
      avatar: null,
    });

    await register(
      request('register', {
        email: '  NEW@EXAMPLE.COM ',
        username: '  new-user  ',
        password: 'Password1',
      })
    );

    expect(mocks.checkUser).toHaveBeenCalledWith('email', 'new@example.com');
    expect(mocks.createUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'new@example.com',
        username: 'new-user',
      }),
    });
  });
});
