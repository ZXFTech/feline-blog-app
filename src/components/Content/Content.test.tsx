import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Content from './index';

describe('Content', () => {
  it('AC-2 keeps main, right and left in document order and preserves props', () => {
    const { container } = render(
      <Content
        className="custom-main"
        data-testid="content-shell"
        leftSideBar={<span>展示内容</span>}
        rightSideBar={<button>操作内容</button>}
      >
        <p>主内容</p>
      </Content>
    );

    expect(screen.getByTestId('content-shell')).toHaveClass('content-container');
    const grid = container.querySelector('.content-grid')!;
    expect([...grid.children].map((child) => child.classList[0])).toEqual([
      'content',
      'right-side-bar',
      'left-side-bar',
    ]);
    expect(container.querySelector('#content')).toHaveClass('custom-main');
  });

  it('AC-2 omits empty sidebar regions', () => {
    const { container } = render(<Content>只有主区</Content>);
    expect(container.querySelectorAll('aside')).toHaveLength(0);
    expect(container.querySelector('.content-grid')).not.toHaveAttribute('data-has-left');
  });
});
