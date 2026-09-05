import { getAllTags, getSortedTags } from '@/db/tagAction';
import logger from '@/lib/logger/Logger';
import { actionResponse } from '@/lib/response/ApiResponse';
import { safeErrorContext } from '@/lib/server/error';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const countBy = params.get('countBy');
    const result =
      countBy === null
        ? await getAllTags()
        : await getSortedTags(countBy, params.get('orderBy') ?? undefined);
    return result.status === 'success'
      ? actionResponse.success(result.data)
      : actionResponse.fromFailure(result);
  } catch (error) {
    logger.error(safeErrorContext('tagRoute', error));
    return actionResponse.error('内部错误');
  }
}
