import { expect, request as playwrightRequest, test } from '@playwright/test';

import db from '../src/db/client';
import { login, type TestAccount } from './pomodoro-helpers';

const primary: TestAccount = {
  email: process.env.E2E_USER_EMAIL ?? '',
  password: process.env.E2E_USER_PASSWORD ?? '',
};
const secondary: TestAccount = {
  email: process.env.E2E_OTHER_USER_EMAIL ?? '',
  password: process.env.E2E_OTHER_USER_PASSWORD ?? '',
};

test.skip(!primary.email || !primary.password, '需要主测试账号凭据');
test.skip(!secondary.email || !secondary.password, '需要第二测试账号凭据');

test.afterAll(async () => {
  await db.$disconnect();
});

async function testUsers() {
  const [root, other] = await Promise.all([
    db.user.findUnique({ where: { email: primary.email.toLowerCase() } }),
    db.user.findUnique({ where: { email: secondary.email.toLowerCase() } }),
  ]);
  expect(root?.role).toBe('ROOT');
  expect(other).not.toBeNull();
  return { root: root!, other: other! };
}

test('covers: AC-3, private Todo reads and Blog mutations enforce resource ownership', async ({
  page,
}, testInfo) => {
  const { root, other } = await testUsers();
  const marker = `api-safety-${testInfo.project.name}-${Date.now()}`;
  const ownTodo = await db.todo.create({ data: { content: `${marker}-own`, userId: root.id } });
  const foreignTodo = await db.todo.create({
    data: { content: `${marker}-foreign`, userId: other.id },
  });
  const foreignBlog = await db.blog.create({
    data: { title: `${marker}-foreign-title`, content: 'foreign body', authorId: other.id },
  });

  try {
    await login(page, primary);
    await page.goto('/todo');
    await expect(page.getByText(`${marker}-own`, { exact: true })).toBeVisible();
    await expect(page.getByText(`${marker}-foreign`, { exact: true })).toHaveCount(0);

    await page.goto(`/blog/edit/${foreignBlog.id}`);
    await page.getByPlaceholder('无标题').fill(`${marker}-attempted-update`);
    await page.getByRole('button', { name: /提交/ }).click();
    await expect(page.getByText('文章不存在', { exact: true })).toBeVisible();

    const stored = await db.blog.findUnique({ where: { id: foreignBlog.id } });
    expect(stored?.title).toBe(`${marker}-foreign-title`);
  } finally {
    await db.blog.deleteMany({ where: { id: foreignBlog.id } });
    await db.todo.deleteMany({ where: { id: { in: [ownTodo.id, foreignTodo.id] } } });
  }
});

test('covers: AC-9, MariaDB rolls back a tag when the parent write fails', async ({}, testInfo) => {
  const { root } = await testUsers();
  const marker = `rollback-${testInfo.project.name}-${Date.now()}`;

  await expect(
    db.$transaction(async (tx) => {
      await tx.tag.create({ data: { content: marker, color: 'blue', userId: root.id } });
      await tx.todo.create({ data: { content: marker, userId: `missing-${marker}` } });
    })
  ).rejects.toBeTruthy();

  await expect.poll(() => db.tag.count({ where: { userId: root.id, content: marker } })).toBe(0);
});

test('covers: AC-10, concurrent repeated likes keep one relation and an exact cached count', async ({
  browser,
}, testInfo) => {
  const { root } = await testUsers();
  const marker = `concurrent-like-${testInfo.project.name}-${Date.now()}`;
  const blog = await db.blog.create({
    data: { title: marker, content: marker, authorId: root.id },
  });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([login(pageA, primary), login(pageB, primary)]);
    await Promise.all([pageA.goto(`/blog/${blog.id}`), pageB.goto(`/blog/${blog.id}`)]);
    const likeA = pageA.getByRole('button').filter({ hasText: /^favorite0$/ });
    const likeB = pageB.getByRole('button').filter({ hasText: /^favorite0$/ });
    await Promise.all([likeA.click(), likeB.click()]);

    await expect
      .poll(async () => ({
        relationCount: await db.blogLike.count({ where: { blogId: blog.id, userId: root.id } }),
        cachedCount: (
          await db.blog.findUnique({ where: { id: blog.id }, select: { likeCount: true } })
        )?.likeCount,
      }))
      .toEqual({ relationCount: 1, cachedCount: 1 });
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
    await db.blogLike.deleteMany({ where: { blogId: blog.id } });
    await db.blog.deleteMany({ where: { id: blog.id } });
  }
});

test('covers: AC-10, opposing like requests leave the cached count equal to the committed relation', async ({
  browser,
}, testInfo) => {
  const { root } = await testUsers();
  const marker = `opposing-like-${testInfo.project.name}-${Date.now()}`;
  const blog = await db.blog.create({
    data: { title: marker, content: marker, authorId: root.id },
  });
  const contextEnable = await browser.newContext();
  const contextDisable = await browser.newContext();
  const pageEnable = await contextEnable.newPage();
  const pageDisable = await contextDisable.newPage();

  try {
    await login(pageEnable, primary);
    await pageEnable.goto(`/blog/${blog.id}`);
    await db.blogLike.create({ data: { blogId: blog.id, userId: root.id } });
    await db.blog.update({ where: { id: blog.id }, data: { likeCount: 1 } });
    await login(pageDisable, primary);
    await pageDisable.goto(`/blog/${blog.id}`);

    const staleEnable = pageEnable.getByRole('button').filter({ hasText: /^favorite0$/ });
    const disable = pageDisable.getByRole('button').filter({ hasText: /^favorite1$/ });
    await Promise.all([staleEnable.click(), disable.click()]);
    await Promise.all([
      pageEnable.waitForLoadState('networkidle'),
      pageDisable.waitForLoadState('networkidle'),
    ]);

    await expect
      .poll(async () => {
        const relationCount = await db.blogLike.count({ where: { blogId: blog.id } });
        const stored = await db.blog.findUnique({
          where: { id: blog.id },
          select: { likeCount: true },
        });
        return relationCount <= 1 && stored?.likeCount === relationCount;
      })
      .toBe(true);
  } finally {
    await Promise.all([contextEnable.close(), contextDisable.close()]);
    await db.blogLike.deleteMany({ where: { blogId: blog.id } });
    await db.blog.deleteMany({ where: { id: blog.id } });
  }
});

test('covers: AC-1 AC-2 AC-6 AC-7, live routes preserve safe projections and status distinctions', async ({
  request,
}) => {
  const malformed = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  expect(malformed.status).toBe(400);
  await expect(malformed.json()).resolves.toEqual({
    error: true,
    message: '请求内容不是有效的 JSON',
    data: null,
  });

  const anonymousTag = await request.get('/api/tag');
  expect(anonymousTag.status()).toBe(401);

  const userContext = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3000' });
  try {
    const loginResponse = await userContext.post('/api/auth/login', { data: secondary });
    expect(loginResponse.status()).toBe(200);
    const forbiddenTag = await userContext.get('/api/tag');
    expect(forbiddenTag.status()).toBe(403);
  } finally {
    await userContext.dispose();
  }

  const duplicate = await request.post('/api/auth/register', {
    data: { email: primary.email, password: primary.password, username: 'duplicate' },
  });
  expect(duplicate.status()).toBe(409);

  const publicBlogs = await request.get('/api/blog');
  expect(publicBlogs.status()).toBe(200);
  const publicBody = (await publicBlogs.json()) as {
    data: { blogs: Array<{ author: Record<string, unknown> }> };
  };
  for (const blog of publicBody.data.blogs) {
    expect(Object.keys(blog.author).sort()).toEqual(['avatar', 'id', 'username']);
  }
});
