import React from 'react';
import { render, screen } from '@testing-library/react';
import ActivityItem from '../ActivityItem';

describe('ActivityItem', () => {
  const defaultProps = {
    title: 'Product Created',
    description: 'New product added to inventory',
    timestamp: '2 hours ago',
  };

  it('should render title, description, and timestamp', () => {
    render(<ActivityItem {...defaultProps} />);
    expect(screen.getByText('Product Created')).toBeInTheDocument();
    expect(screen.getByText('New product added to inventory')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('should render product icon by default', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const iconContainer = container.querySelector('.bg-blue-50');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should render scan icon when iconType is scan', () => {
    const { container } = render(<ActivityItem {...defaultProps} iconType="scan" />);
    const iconContainer = container.querySelector('.bg-green-50');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should render warning icon when iconType is warning', () => {
    const { container } = render(<ActivityItem {...defaultProps} iconType="warning" />);
    const iconContainer = container.querySelector('.bg-yellow-50');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should apply proper container classes', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const item = container.firstChild as HTMLElement;
    expect(item).toHaveClass('flex', 'items-start', 'gap-4', 'p-4', 'bg-white', 'border', 'border-gray-200', 'rounded-xl', 'shadow-sm');
  });

  it('should apply hover classes', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const item = container.firstChild as HTMLElement;
    expect(item).toHaveClass('hover:shadow-md', 'transition-all');
  });

  it('should truncate long titles', () => {
    const longTitle = 'This is a very long product title that should be truncated when displayed in the activity feed';
    render(<ActivityItem {...defaultProps} title={longTitle} />);
    const titleElement = screen.getByText(longTitle);
    expect(titleElement).toHaveClass('truncate');
  });

  it('should truncate long descriptions', () => {
    const longDescription = 'This is a very long description that should be truncated when displayed in the activity feed to maintain layout consistency';
    render(<ActivityItem {...defaultProps} description={longDescription} />);
    const descElement = screen.getByText(longDescription);
    expect(descElement).toHaveClass('truncate');
  });

  it('should render timestamp with proper styling', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const timestamp = screen.getByText('2 hours ago');
    expect(timestamp).toHaveClass('text-xs', 'font-medium', 'text-gray-400', 'whitespace-nowrap');
  });

  it('should render icon container with proper dimensions', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const iconContainer = container.querySelector('.w-10.h-10');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should render icon as rounded circle', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const iconContainer = container.querySelector('.rounded-full');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should render SVG icon', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should have proper flex layout', () => {
    const { container } = render(<ActivityItem {...defaultProps} />);
    const item = container.firstChild as HTMLElement;
    expect(item).toHaveClass('flex');
  });
});
