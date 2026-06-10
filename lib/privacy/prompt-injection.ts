// Prompt injection detection and defense
// Protects against attempts to manipulate LLM behavior through user input

export interface InjectionCheck {
  detected: boolean;
  phrase?: string;
  severity: 'low' | 'medium' | 'high';
  category?: string;
}

/**
 * Detect prompt injection attempts in user input
 * Checks for common patterns that attempt to override system instructions
 */
export function detectPromptInjection(text: string): InjectionCheck {
  const normalized = text.toLowerCase();

  // High severity: Direct instruction manipulation
  const highSeverityPatterns = [
    { pattern: /ignore (previous|all|prior|above) (instructions|prompts|rules)/i, category: 'instruction_override' },
    { pattern: /you are (now|a|an) /i, category: 'role_hijacking' },
    { pattern: /act as (if|a|an)/i, category: 'role_hijacking' },
    { pattern: /pretend (you|to|that)/i, category: 'role_hijacking' },
    { pattern: /system:\s/i, category: 'system_impersonation' },
    { pattern: /assistant:\s/i, category: 'assistant_impersonation' },
  ];

  for (const { pattern, category } of highSeverityPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        phrase: match[0],
        severity: 'high',
        category,
      };
    }
  }

  // Medium severity: Output manipulation
  const mediumSeverityPatterns = [
    { pattern: /repeat (after|back|the following)/i, category: 'output_manipulation' },
    { pattern: /(return|output|say|write) (exactly|only|just)/i, category: 'output_manipulation' },
    { pattern: /disregard (previous|above|all)/i, category: 'instruction_override' },
    { pattern: /forget (everything|all|what)/i, category: 'instruction_override' },
    { pattern: /new (instructions|rules|guidelines)/i, category: 'instruction_override' },
  ];

  for (const { pattern, category } of mediumSeverityPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        phrase: match[0],
        severity: 'medium',
        category,
      };
    }
  }

  // Low severity: Suspicious but possibly legitimate
  const lowSeverityPatterns = [
    { pattern: /roleplay/i, category: 'role_hijacking' },
    { pattern: /simulate/i, category: 'role_hijacking' },
    { pattern: /in character/i, category: 'role_hijacking' },
  ];

  for (const { pattern, category } of lowSeverityPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        phrase: match[0],
        severity: 'low',
        category,
      };
    }
  }

  return {
    detected: false,
    severity: 'low',
  };
}

/**
 * Sanitize user input by removing/escaping potentially dangerous content
 * Less aggressive than blocking - allows content through with modifications
 */
export function sanitizeInput(text: string): string {
  // Remove control characters
  let sanitized = text.replace(/[\x00-\x1F\x7F]/g, '');

  // Escape common injection markers
  sanitized = sanitized
    .replace(/system:/gi, 'user said system:')
    .replace(/assistant:/gi, 'user said assistant:')
    .replace(/\[INST\]/gi, '[user said INST]')
    .replace(/\[\/INST\]/gi, '[user said /INST]');

  return sanitized;
}

/**
 * Check if input contains attempts to leak sensitive data
 * Detects patterns like "include the password" or "print the API key"
 */
export function detectDataLeakAttempt(text: string): InjectionCheck {
  const leakPatterns = [
    /include (the |your )?(password|api key|secret|token|credentials)/i,
    /print (the |your )?(password|api key|secret|token|credentials)/i,
    /show (me )?(the |your )?(password|api key|secret|token|credentials)/i,
    /what (is|are) (the |your )?(password|api key|secret|token|credentials)/i,
    /reveal (the |your )?(password|api key|secret|token|credentials)/i,
  ];

  for (const pattern of leakPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        phrase: match[0],
        severity: 'high',
        category: 'data_leak_attempt',
      };
    }
  }

  return { detected: false, severity: 'low' };
}

/**
 * Comprehensive safety check for user input
 * Combines injection, leak, and PII detection
 */
export interface SafetyGateResult {
  safe: boolean;
  blocked: boolean;
  issues: Array<{
    type: 'injection' | 'leak' | 'pii';
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;
  sanitizedInput: string;
}

export function runSafetyGate(text: string): SafetyGateResult {
  const issues: SafetyGateResult['issues'] = [];
  let blocked = false;

  // Check 1: Prompt injection
  const injectionCheck = detectPromptInjection(text);
  if (injectionCheck.detected) {
    issues.push({
      type: 'injection',
      severity: injectionCheck.severity,
      message: `Potential prompt injection detected: ${injectionCheck.category}`,
    });
    if (injectionCheck.severity === 'high') blocked = true;
  }

  // Check 2: Data leak attempts
  const leakCheck = detectDataLeakAttempt(text);
  if (leakCheck.detected) {
    issues.push({
      type: 'leak',
      severity: leakCheck.severity,
      message: `Potential data leak attempt detected`,
    });
    if (leakCheck.severity === 'high') blocked = true;
  }

  // Sanitize input (only if not blocked)
  const sanitizedInput = blocked ? text : sanitizeInput(text);

  return {
    safe: issues.length === 0,
    blocked,
    issues,
    sanitizedInput,
  };
}
