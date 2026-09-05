import { describe, expect, it } from 'vitest';

import { safeErrorContext } from './error';

describe('safeErrorContext', () => {
  it('AC-14 emits only allowlisted metadata for hostile errors', () => {
    const error = Object.assign(new Error('password=hunter2 token=secret article body'), {
      cause: new Error('database query and submitted values'),
      query: 'select secret',
      password: 'hunter2',
    });

    const context = safeErrorContext('saveBlog', error, { userId: 'user-1', resourceId: 7 });

    expect(context).toEqual({
      operation: 'saveBlog',
      category: 'unexpected',
      userId: 'user-1',
      resourceId: 7,
      errorClass: 'Error',
    });
    expect(JSON.stringify(context)).not.toMatch(/hunter2|secret|article body|select/i);
  });
});
