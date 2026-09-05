import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkUser: vi.fn(),
  getCookieData: vi.fn(),
  verifyToken: vi.fn(),
  unstableRethrow: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/db/userAction', () => ({ checkUser: mocks.checkUser }));
vi.mock('@/lib/cookieStore', () => ({ getCookieData: mocks.getCookieData }));
vi.mock('@/lib/jwt', () => ({ verifyToken: mocks.verifyToken }));
vi.mock('next/navigation', () => ({ unstable_rethrow: mocks.unstableRethrow }));
vi.mock('@/lib/logger/Logger', () => ({
  default: { error: mocks.loggerError },
}));

import { getCurrentUser, resolveCurrentUser } from './userAuth';

describe('getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('covers: AC-7, restores the current user from a valid token cookie', async () => {
    const user = {
      id: 'user-1',
      email: 'cat@example.com',
      username: '猫猫',
      role: 'USER',
      avatar: null,
    };
    mocks.getCookieData.mockResolvedValue({
      name: 'token',
      value: 'valid-token',
    });
    mocks.verifyToken.mockReturnValue({ userId: 'user-1' });
    mocks.checkUser.mockResolvedValue(user);

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(mocks.checkUser).toHaveBeenCalledWith('id', 'user-1');
  });

  it('covers: AC-7, returns null when the token cookie is missing', async () => {
    mocks.getCookieData.mockResolvedValue(undefined);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(mocks.checkUser).not.toHaveBeenCalled();
  });

  it('covers: AC-7, returns null when the token is tampered or expired', async () => {
    mocks.getCookieData.mockResolvedValue({
      name: 'token',
      value: 'bad-token',
    });
    mocks.verifyToken.mockReturnValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.checkUser).not.toHaveBeenCalled();
  });

  it('covers: AC-7, does not expose a database failure as an authenticated user', async () => {
    const databaseError = new Error('database unavailable');
    mocks.getCookieData.mockResolvedValue({
      name: 'token',
      value: 'valid-token',
    });
    mocks.verifyToken.mockReturnValue({ userId: 'user-1' });
    mocks.checkUser.mockRejectedValue(databaseError);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.unstableRethrow).toHaveBeenCalledWith(databaseError);
    expect(mocks.loggerError).toHaveBeenCalledWith({
      category: 'unexpected',
      errorClass: 'Error',
      operation: 'getCurrentUser',
    });
    expect(mocks.loggerError).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database unavailable' })
    );
  });
});

describe('resolveCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('distinguishes a missing credential from an infrastructure failure', async () => {
    mocks.getCookieData.mockResolvedValue(undefined);
    await expect(resolveCurrentUser()).resolves.toEqual({
      status: 'unauthenticated',
      message: '请重新登录',
    });

    mocks.getCookieData.mockRejectedValue(new Error('cookie store unavailable'));
    await expect(resolveCurrentUser()).resolves.toEqual({
      status: 'temporary_failure',
      message: '暂时无法验证登录状态，请稍后重试',
    });
    expect(mocks.loggerError).toHaveBeenLastCalledWith({
      category: 'unexpected',
      errorClass: 'Error',
      operation: 'resolveCurrentUser',
    });
  });
});
