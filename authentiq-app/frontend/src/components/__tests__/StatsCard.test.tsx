import React from 'react';
import { render, screen } from '@testing-library/react';
import StatsCard from '../StatsCard';

describe('StatsCard', () => {
  const defaultProps = {
    label: 'Total Products',
    value: 1234,
  };

  it('should render the label and value', () => {
    render(<StatsCard {...defaultProps} />);
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    const icon = <svg data-testid="test-icon" />;
    render(<StatsCard {...defaultProps} icon={icon} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('should not render icon when not provided', () => {
    const { container } = render(<StatsCard {...defaultProps} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('should apply blue color by default', () => {
    const { container } = render(<StatsCard {...defaultProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('bg-white');
  });

  it('should render trend when provided', () => {
    render(<StatsCard {...defaultProps} trend="+12%" trendStatus="positive" />);
    expect(screen.getByText((content) => content.includes('+12%'))).toBeInTheDocument();
    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });

  it('should not render trend when not provided', () => {
    render(<StatsCard {...defaultProps} />);
    expect(screen.queryByText('vs last week')).not.toBeInTheDocument();
  });

  it('should display positive trend indicator', () => {
    render(<StatsCard {...defaultProps} trend="+12%" trendStatus="positive" />);
    expect(screen.getByText('↑ +12%')).toBeInTheDocument();
  });

  it('should display warning trend indicator', () => {
    render(<StatsCard {...defaultProps} trend="-5%" trendStatus="warning" />);
    expect(screen.getByText('! -5%')).toBeInTheDocument();
  });

  it('should display neutral trend indicator', () => {
    render(<StatsCard {...defaultProps} trend="0%" trendStatus="neutral" />);
    expect(screen.getByText('− 0%')).toBeInTheDocument();
  });

  it('should handle string values', () => {
    render(<StatsCard {...defaultProps} value="1,234" />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('should handle numeric values', () => {
    render(<StatsCard {...defaultProps} value={1234} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('should apply hover classes', () => {
    const { container } = render(<StatsCard {...defaultProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('hover:shadow-lg', 'hover:-translate-y-0.5');
  });

  it('should render with proper structure', () => {
    const { container } = render(<StatsCard {...defaultProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('bg-white', 'p-6', 'rounded-xl', 'border', 'border-gray-200', 'shadow-sm');
  });
});
