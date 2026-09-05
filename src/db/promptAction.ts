'use server';

import { PromptObj } from '@/app/formatter/page';
import { hasRootRole } from '@/lib/auth/userAuth';
import { actionResult } from '@/lib/server/actionResult';
import { safeErrorContext } from '@/lib/server/error';
import { parseString, utf8ByteLength } from '@/lib/server/validation';
import logger from '@/lib/logger/Logger';
import db from './client';

type ImgPlatform = 'midjourney';

export async function savePrompt(promptList: unknown, platform: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  if (platform !== 'midjourney' || !Array.isArray(promptList)) {
    return actionResult.failure('invalid_input', 'Prompt 内容无效');
  }
  const parsed: PromptObj[] = [];
  for (const value of promptList) {
    if (!value || typeof value !== 'object')
      return actionResult.failure('invalid_input', 'Prompt 内容无效');
    const item = value as Record<string, unknown>;
    const id = parseString(item.id, { label: '来源 ID', max: 191 });
    const content = parseString(item.content, { label: 'Prompt', max: 65_535, trim: false });
    const mark = parseString(item.mark, { label: '标记', max: 191, allowEmpty: true });
    if (!id || content === null || mark === null || utf8ByteLength(content) > 65_535) {
      return actionResult.failure('invalid_input', 'Prompt 内容无效');
    }
    parsed.push({ id, content, mark, imgUrl: typeof item.imgUrl === 'string' ? item.imgUrl : '' });
  }
  try {
    const result = await db.prompt.createMany({
      data: parsed.map((item) => ({
        originId: item.id,
        content: item.content,
        platform: platform as ImgPlatform,
        marks: item.mark,
      })),
    });
    return actionResult.success({ count: result.count });
  } catch (error) {
    logger.error(safeErrorContext('savePrompt', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法保存 Prompt');
  }
}
