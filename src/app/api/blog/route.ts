import { NextRequest } from 'next/server';

import { getBlogList } from '@/db/blogAction';
import { actionResponse } from '@/lib/response/ApiResponse';

export async function GET(req: NextRequest) {
  // const data = await req.json();

  const params = req.nextUrl.searchParams;

  const orderBy = params.get('orderBy') === 'asc' ? 'asc' : 'desc';
  const content = params.get('content')?.trim() || '';

  const result = await getBlogList(1, 20, { content, orderBy });
  return result.status === 'success'
    ? actionResponse.success(result.data)
    : actionResponse.fromFailure(result);
}
