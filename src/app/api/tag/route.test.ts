import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAllTags: vi.fn(),
  getSortedTags: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('@/db/tagAction', () => ({
  getAllTags: mocks.getAllTags,
  getSortedTags: mocks.getSortedTags,
}));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: mocks.logError } }));

import { GET } from './route';

describe('GET /api/tag', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['invalid_input', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['temporary_failure', 503],
  ] as const)('AC-6 maps %s to HTTP %s without internal details', async (status, expected) => {
    mocks.getAllTags.mockResolvedValue({ status, message: 'safe message' });

    const response = await GET(new NextRequest('http://localhost/api/tag'));

    expect(response.status).toBe(expected);
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'safe message',
      data: null,
    });
  });

  it('AC-6 returns a sanitized HTTP 500 for an unexpected exception', async () => {
    mocks.getAllTags.mockRejectedValue(new Error('database query token=secret'));

    const response = await GET(new NextRequest('http://localhost/api/tag'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: '内部错误',
      data: null,
    });
    expect(mocks.logError).toHaveBeenCalledWith({
      operation: 'tagRoute',
      category: 'unexpected',
      errorClass: 'Error',
    });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain('token=secret');
  });
});
