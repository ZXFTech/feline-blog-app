export type ActionFailureStatus =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'temporary_failure';

export type ActionFailure = {
  status: ActionFailureStatus;
  message: string;
  fields?: Record<string, string>;
};

export type ActionSuccess<T> = { status: 'success'; data: T };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export const actionResult = {
  success: <T>(data: T): ActionSuccess<T> => ({ status: 'success', data }),
  failure: (
    status: ActionFailureStatus,
    message: string,
    fields?: Record<string, string>
  ): ActionFailure => ({ status, message, ...(fields ? { fields } : {}) }),
};

export function actionMessage(result: ActionFailure) {
  return result.message || '操作失败，请稍后重试';
}
