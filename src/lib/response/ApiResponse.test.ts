import { describe, expect, it } from 'vitest';

import { actionResponse } from './ApiResponse';

describe('actionResponse', () => {
  it.each([
    ['invalid_input', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['temporary_failure', 503],
  ] as const)('AC-5 AC-6 maps %s to HTTP %s', async (status, expectedStatus) => {
    const response = actionResponse.fromFailure({ status, message: 'safe message' });

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'safe message',
      data: null,
    });
  });
});
