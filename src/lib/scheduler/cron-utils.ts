/**
 * Cron Expression Utilities
 * Parse and calculate next run times for cron expressions
 * 
 * Format: minute hour day month weekday
 * Examples:
 * - "0 * * * *" - Every hour
 * - "0 9 * * *" - Every day at 9am
 * - "0 9 * * 1" - Every Monday at 9am
 * - "0 0 1 * *" - First day of month at midnight
 */

export interface CronExpression {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export interface CronSchedule {
  expression: string;
  description: string;
  isValid: boolean;
  nextRun?: Date;
  error?: string;
}

// Common cron presets
export const CRON_PRESETS = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_10_MINUTES: '*/10 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_2_HOURS: '0 */2 * * *',
  EVERY_3_HOURS: '0 */3 * * *',
  EVERY_4_HOURS: '0 */4 * * *',
  EVERY_6_HOURS: '0 */6 * * *',
  EVERY_8_HOURS: '0 */8 * * *',
  EVERY_12_HOURS: '0 */12 * * *',
  DAILY_6AM: '0 6 * * *',
  DAILY_9AM: '0 9 * * *',
  DAILY_NOON: '0 12 * * *',
  DAILY_6PM: '0 18 * * *',
  DAILY_MIDNIGHT: '0 0 * * *',
  WEEKDAYS_9AM: '0 9 * * 1-5',
  WEEKENDS_10AM: '0 10 * * 0,6',
  WEEKLY_MONDAY_9AM: '0 9 * * 1',
  WEEKLY_FRIDAY_5PM: '0 17 * * 5',
  WEEKLY_SUNDAY_MIDNIGHT: '0 0 * * 0',
  BIWEEKLY_MONDAY_9AM: '0 9 1,15 * *',
  MONTHLY_FIRST: '0 0 1 * *',
  MONTHLY_FIRST_9AM: '0 9 1 * *',
  MONTHLY_15TH: '0 0 15 * *',
  QUARTERLY_FIRST: '0 0 1 1,4,7,10 *',
  YEARLY_JAN_FIRST: '0 0 1 1 *',
};

export const CRON_PRESET_LABELS: Record<string, string> = {
  [CRON_PRESETS.EVERY_MINUTE]: 'Every minute',
  [CRON_PRESETS.EVERY_5_MINUTES]: 'Every 5 minutes',
  [CRON_PRESETS.EVERY_10_MINUTES]: 'Every 10 minutes',
  [CRON_PRESETS.EVERY_15_MINUTES]: 'Every 15 minutes',
  [CRON_PRESETS.EVERY_30_MINUTES]: 'Every 30 minutes',
  [CRON_PRESETS.EVERY_HOUR]: 'Every hour',
  [CRON_PRESETS.EVERY_2_HOURS]: 'Every 2 hours',
  [CRON_PRESETS.EVERY_3_HOURS]: 'Every 3 hours',
  [CRON_PRESETS.EVERY_4_HOURS]: 'Every 4 hours',
  [CRON_PRESETS.EVERY_6_HOURS]: 'Every 6 hours',
  [CRON_PRESETS.EVERY_8_HOURS]: 'Every 8 hours',
  [CRON_PRESETS.EVERY_12_HOURS]: 'Every 12 hours',
  [CRON_PRESETS.DAILY_6AM]: 'Every day at 6:00 AM',
  [CRON_PRESETS.DAILY_9AM]: 'Every day at 9:00 AM',
  [CRON_PRESETS.DAILY_NOON]: 'Every day at noon',
  [CRON_PRESETS.DAILY_6PM]: 'Every day at 6:00 PM',
  [CRON_PRESETS.DAILY_MIDNIGHT]: 'Every day at midnight',
  [CRON_PRESETS.WEEKDAYS_9AM]: 'Weekdays at 9:00 AM',
  [CRON_PRESETS.WEEKENDS_10AM]: 'Weekends at 10:00 AM',
  [CRON_PRESETS.WEEKLY_MONDAY_9AM]: 'Every Monday at 9:00 AM',
  [CRON_PRESETS.WEEKLY_FRIDAY_5PM]: 'Every Friday at 5:00 PM',
  [CRON_PRESETS.WEEKLY_SUNDAY_MIDNIGHT]: 'Every Sunday at midnight',
  [CRON_PRESETS.BIWEEKLY_MONDAY_9AM]: '1st & 15th at 9:00 AM',
  [CRON_PRESETS.MONTHLY_FIRST]: 'First of the month at midnight',
  [CRON_PRESETS.MONTHLY_FIRST_9AM]: 'First of the month at 9:00 AM',
  [CRON_PRESETS.MONTHLY_15TH]: '15th of the month at midnight',
  [CRON_PRESETS.QUARTERLY_FIRST]: 'Quarterly (Jan, Apr, Jul, Oct)',
  [CRON_PRESETS.YEARLY_JAN_FIRST]: 'January 1st every year',
};

/**
 * Parse cron expression into components
 */
export function parseCronExpression(expression: string): CronExpression | null {
  const parts = expression.trim().split(/\s+/);
  
  if (parts.length !== 5) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

/**
 * Validate cron expression
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  const parsed = parseCronExpression(expression);
  
  if (!parsed) {
    return { valid: false, error: 'Invalid format. Expected: minute hour day month weekday' };
  }

  // Validate each field
  if (!validateCronField(parsed.minute, 0, 59)) {
    return { valid: false, error: 'Invalid minute (0-59)' };
  }
  
  if (!validateCronField(parsed.hour, 0, 23)) {
    return { valid: false, error: 'Invalid hour (0-23)' };
  }
  
  if (!validateCronField(parsed.dayOfMonth, 1, 31)) {
    return { valid: false, error: 'Invalid day of month (1-31)' };
  }
  
  if (!validateCronField(parsed.month, 1, 12)) {
    return { valid: false, error: 'Invalid month (1-12)' };
  }
  
  if (!validateCronField(parsed.dayOfWeek, 0, 6)) {
    return { valid: false, error: 'Invalid day of week (0-6)' };
  }

  return { valid: true };
}

/**
 * Validate individual cron field
 */
function validateCronField(field: string, min: number, max: number): boolean {
  // Wildcard
  if (field === '*') return true;
  
  // Step values (e.g., */5)
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    if (range !== '*' && !validateCronField(range, min, max)) return false;
    const stepNum = parseInt(step, 10);
    return !isNaN(stepNum) && stepNum > 0 && stepNum <= max;
  }
  
  // Range (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start < end;
  }
  
  // List (e.g., 1,2,3)
  if (field.includes(',')) {
    return field.split(',').every(n => {
      const num = parseInt(n, 10);
      return !isNaN(num) && num >= min && num <= max;
    });
  }
  
  // Single value
  const num = parseInt(field, 10);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Calculate next run time for a cron expression
 * This is a simplified version - in production, use a library like cron-parser
 */
export function calculateNextRun(
  expression: string,
  from: Date = new Date(),
  _timezone: string = 'UTC'
): Date | null {
  const parsed = parseCronExpression(expression);
  if (!parsed) return null;

  const validation = validateCronExpression(expression);
  if (!validation.valid) return null;

  // Simple calculation - start from next minute
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Check up to 1000 iterations (prevents infinite loop)
  for (let i = 0; i < 1000; i++) {
    if (matchesCron(next, parsed)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  return null;
}

/**
 * Check if date matches cron expression
 */
function matchesCron(date: Date, cron: CronExpression): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 0-indexed to 1-indexed
  const dayOfWeek = date.getDay();

  return (
    matchesField(minute, cron.minute, 0, 59) &&
    matchesField(hour, cron.hour, 0, 23) &&
    matchesField(dayOfMonth, cron.dayOfMonth, 1, 31) &&
    matchesField(month, cron.month, 1, 12) &&
    matchesField(dayOfWeek, cron.dayOfWeek, 0, 6)
  );
}

/**
 * Check if value matches cron field
 */
function matchesField(value: number, field: string, min: number, _max: number): boolean {
  // Wildcard
  if (field === '*') return true;

  // Step values (e.g., */5)
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = parseInt(step, 10);
    if (range === '*') {
      return value % stepNum === 0;
    }
    // Range with step
    const rangeStart = range.includes('-') ? parseInt(range.split('-')[0], 10) : min;
    return value >= rangeStart && (value - rangeStart) % stepNum === 0;
  }

  // Range (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    return value >= start && value <= end;
  }

  // List (e.g., 1,2,3)
  if (field.includes(',')) {
    const values = field.split(',').map(n => parseInt(n, 10));
    return values.includes(value);
  }

  // Single value
  return value === parseInt(field, 10);
}

/**
 * Get human-readable description of cron expression
 */
export function describeCronExpression(expression: string): string {
  // Check if it's a preset
  const presetLabel = CRON_PRESET_LABELS[expression];
  if (presetLabel) return presetLabel;

  const parsed = parseCronExpression(expression);
  if (!parsed) return 'Invalid cron expression';

  const parts: string[] = [];

  // Minute
  if (parsed.minute === '*') {
    parts.push('every minute');
  } else if (parsed.minute.includes('/')) {
    const step = parsed.minute.split('/')[1];
    parts.push(`every ${step} minutes`);
  } else {
    parts.push(`at minute ${parsed.minute}`);
  }

  // Hour
  if (parsed.hour !== '*') {
    if (parsed.hour.includes('/')) {
      const step = parsed.hour.split('/')[1];
      parts.push(`every ${step} hours`);
    } else {
      const hour = parseInt(parsed.hour, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      parts.push(`at ${displayHour}:00 ${ampm}`);
    }
  }

  // Day of month
  if (parsed.dayOfMonth !== '*') {
    parts.push(`on day ${parsed.dayOfMonth}`);
  }

  // Month
  if (parsed.month !== '*') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNum = parseInt(parsed.month, 10) - 1;
    parts.push(`in ${months[monthNum]}`);
  }

  // Day of week
  if (parsed.dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNum = parseInt(parsed.dayOfWeek, 10);
    parts.push(`on ${days[dayNum]}`);
  }

  return parts.join(', ');
}

/**
 * Get next N run times for a cron expression
 */
export function getNextRuns(
  expression: string,
  count: number = 5,
  from: Date = new Date()
): Date[] {
  const runs: Date[] = [];
  let current = from;

  for (let i = 0; i < count; i++) {
    const next = calculateNextRun(expression, current);
    if (!next) break;
    runs.push(new Date(next));
    current = new Date(next.getTime() + 60000); // Add 1 minute
  }

  return runs;
}
