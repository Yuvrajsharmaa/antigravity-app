// Patterns to block in chat messages
const PHONE_PATTERNS = [
  /\b\d{10}\b/,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\+\d{1,3}\s?\d{6,12}\b/,
];

const EMAIL_PATTERN = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/;

const SOCIAL_PATTERNS = [
  /@?instagram/i,
  /\binsta\b/i,
  /telegram/i,
  /whatsapp/i,
  /wa\.me/i,
  /t\.me/i,
  /snapchat/i,
  /\bsnap\b/i,
];

const PHRASE_PATTERNS = [
  /(call|text|reach)\s*me/i,
  /my\s*(number|phone|cell|mobile)/i,
  /contact\s*me\s*(on|at|via)/i,
  /add\s*me\s*on/i,
  /dm\s*me/i,
  /message\s*me\s*(on|at)/i,
];

const CRISIS_PATTERNS = [
  /want\s*to\s*die/i,
  /kill\s*myself/i,
  /end\s*my\s*life/i,
  /can'?t\s*go\s*on/i,
  /suicide/i,
  /harm\s*myself/i,
  /don'?t\s*want\s*to\s*live/i,
  /no\s*reason\s*to\s*live/i,
];

export type ModerationResult = {
  isBlocked: boolean;
  isCrisis: boolean;
  reason?: string;
};

export function moderateMessage(text: string): ModerationResult {
  // Check phone numbers
  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(text)) {
      return { isBlocked: true, isCrisis: false, reason: 'contact_sharing' };
    }
  }

  // Check email
  if (EMAIL_PATTERN.test(text)) {
    return { isBlocked: true, isCrisis: false, reason: 'contact_sharing' };
  }

  // Check social handles
  for (const pattern of SOCIAL_PATTERNS) {
    if (pattern.test(text)) {
      return { isBlocked: true, isCrisis: false, reason: 'contact_sharing' };
    }
  }

  // Check phrases
  for (const pattern of PHRASE_PATTERNS) {
    if (pattern.test(text)) {
      return { isBlocked: true, isCrisis: false, reason: 'contact_sharing' };
    }
  }

  // Check crisis keywords
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      return { isBlocked: false, isCrisis: true, reason: 'crisis_keyword' };
    }
  }

  return { isBlocked: false, isCrisis: false };
}
