// Privacy-first de-identification for health data before LLM calls
import { createHash } from 'crypto';

export interface DeidentifiedData<T> {
  data: T;
  replacementMap: Map<string, string>;
  redactedFields: string[];
}

export interface PHICheck {
  found: boolean;
  redacted: string;
  replacementMap: Map<string, string>;
  piiTypes: string[];
}

/**
 * De-identify health data before sending to LLM
 * Replaces identifiable information with placeholders
 */
export function deidentifyHealthData<T extends Record<string, any>>(
  data: T,
  fieldsToRedact: string[] = ['name', 'email', 'phone', 'address'],
): DeidentifiedData<T> {
  const replacementMap = new Map<string, string>();
  const redactedFields: string[] = [];
  const deidentified = { ...data } as Record<string, any>;

  fieldsToRedact.forEach(field => {
    if (deidentified[field]) {
      const original = String(deidentified[field]);
      const placeholder = `REDACTED_${field.toUpperCase()}_${hashString(original).slice(0, 8)}`;
      replacementMap.set(placeholder, original);
      deidentified[field] = placeholder;
      redactedFields.push(field);
    }
  });

  return {
    data: deidentified as T,
    replacementMap,
    redactedFields,
  };
}

/**
 * Re-hydrate data server-side after LLM processing
 */
export function rehydrateData(
  text: string,
  replacementMap: Map<string, string>,
): string {
  let rehydrated = text;
  replacementMap.forEach((original, placeholder) => {
    rehydrated = rehydrated.replace(new RegExp(placeholder, 'g'), original);
  });
  return rehydrated;
}

/**
 * Check for PII in free-text (voice notes, user input)
 * Redacts emails, phone numbers, SSNs, credit cards
 */
export function checkForPII(text: string): PHICheck {
  const replacementMap = new Map<string, string>();
  const piiTypes: string[] = [];
  let redacted = text;
  let found = false;

  // Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex);
  if (emails) {
    found = true;
    piiTypes.push('email');
    emails.forEach((email, i) => {
      const placeholder = `EMAIL_${i}_${hashString(email).slice(0, 8)}`;
      replacementMap.set(placeholder, email);
      redacted = redacted.replace(email, placeholder);
    });
  }

  // Phone numbers (various formats)
  const phoneRegex = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const phones = text.match(phoneRegex);
  if (phones) {
    found = true;
    piiTypes.push('phone');
    phones.forEach((phone, i) => {
      const placeholder = `PHONE_${i}_${hashString(phone).slice(0, 8)}`;
      replacementMap.set(placeholder, phone);
      redacted = redacted.replace(phone, placeholder);
    });
  }

  // SSN (###-##-####)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  const ssns = text.match(ssnRegex);
  if (ssns) {
    found = true;
    piiTypes.push('ssn');
    ssns.forEach((ssn, i) => {
      const placeholder = `SSN_${i}_REDACTED`;
      replacementMap.set(placeholder, ssn);
      redacted = redacted.replace(ssn, placeholder);
    });
  }

  // Credit card numbers (basic pattern)
  const ccRegex = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  const ccs = text.match(ccRegex);
  if (ccs) {
    found = true;
    piiTypes.push('credit_card');
    ccs.forEach((cc, i) => {
      const placeholder = `CC_${i}_REDACTED`;
      replacementMap.set(placeholder, cc);
      redacted = redacted.replace(cc, placeholder);
    });
  }

  return {
    found,
    redacted,
    replacementMap,
    piiTypes,
  };
}

/**
 * Hash string for audit logging (SHA-256)
 * One-way hash for correlation without reversibility
 */
export function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Hash user ID for audit logs
 * Allows querying without exposing actual IDs
 */
export function hashUserId(userId: string): string {
  return hashString(`user:${userId}`);
}

/**
 * De-identify medication list for interaction checks
 */
export function deidentifyMedications(medications: Array<{ id: string; name: string; class?: string }>) {
  const replacementMap = new Map<string, string>();

  const deidentified = medications.map((med, i) => {
    const placeholder = `MED_${i}`;
    replacementMap.set(placeholder, med.name);

    return {
      id: placeholder,
      // Extract generic name (remove brand name in parentheses)
      genericName: med.name.split('(')[0].trim(),
      class: med.class || 'unknown',
    };
  });

  return { deidentified, replacementMap };
}

/**
 * Safe string for logging (truncate + hash)
 * Useful for debugging without exposing full content
 */
export function safeLogString(value: string, maxLength: number = 50): string {
  const truncated = value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  const hash = hashString(value).slice(0, 8);
  return `"${truncated}" (hash: ${hash})`;
}
