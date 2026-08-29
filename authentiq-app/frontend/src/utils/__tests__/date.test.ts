import { getRelativeTime } from '../date';

describe('getRelativeTime', () => {
  beforeEach(() => {
    // Mock current time to ensure consistent test results
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return "Just now" for timestamps less than 60 seconds ago', () => {
    const result = getRelativeTime('2024-01-15T11:59:30Z');
    expect(result).toBe('Just now');
  });

  it('should return "X min ago" for timestamps less than 60 minutes ago', () => {
    const result = getRelativeTime('2024-01-15T11:30:00Z');
    expect(result).toBe('30 mins ago');
  });

  it('should return "1 min ago" for singular minute', () => {
    const result = getRelativeTime('2024-01-15T11:59:00Z');
    expect(result).toBe('1 min ago');
  });

  it('should return "X hour ago" for timestamps less than 24 hours ago', () => {
    const result = getRelativeTime('2024-01-15T06:00:00Z');
    expect(result).toBe('6 hours ago');
  });

  it('should return "1 hour ago" for singular hour', () => {
    const result = getRelativeTime('2024-01-15T11:00:00Z');
    expect(result).toBe('1 hour ago');
  });

  it('should return "X day ago" for timestamps less than 30 days ago', () => {
    const result = getRelativeTime('2024-01-10T12:00:00Z');
    expect(result).toBe('5 days ago');
  });

  it('should return "1 day ago" for singular day', () => {
    const result = getRelativeTime('2024-01-14T12:00:00Z');
    expect(result).toBe('1 day ago');
  });

  it('should return "X month ago" for timestamps less than 12 months ago', () => {
    const result = getRelativeTime('2023-12-15T12:00:00Z');
    expect(result).toBe('1 month ago');
  });

  it('should return "1 month ago" for singular month', () => {
    const result = getRelativeTime('2023-12-15T12:00:00Z');
    expect(result).toBe('1 month ago');
  });

  it('should return "X year ago" for timestamps more than 12 months ago', () => {
    const result = getRelativeTime('2022-01-15T12:00:00Z');
    expect(result).toBe('2 years ago');
  });

  it('should return "1 year ago" for singular year', () => {
    const result = getRelativeTime('2023-01-15T12:00:00Z');
    expect(result).toBe('1 year ago');
  });

  it('should handle Date objects', () => {
    const date = new Date('2024-01-15T11:30:00Z');
    const result = getRelativeTime(date);
    expect(result).toBe('30 mins ago');
  });

  it('should return "Unknown time" for invalid timestamps', () => {
    const result = getRelativeTime('invalid-date');
    expect(result).toBe('Unknown time');
  });

  it('should return "Unknown time" for invalid Date objects', () => {
    const result = getRelativeTime(new Date('invalid'));
    expect(result).toBe('Unknown time');
  });

  it('should handle edge case of exactly 60 seconds', () => {
    const result = getRelativeTime('2024-01-15T11:59:00Z');
    expect(result).toBe('1 min ago');
  });

  it('should handle edge case of exactly 60 minutes', () => {
    const result = getRelativeTime('2024-01-15T11:00:00Z');
    expect(result).toBe('1 hour ago');
  });

  it('should handle edge case of exactly 24 hours', () => {
    const result = getRelativeTime('2024-01-14T12:00:00Z');
    expect(result).toBe('1 day ago');
  });
});
