import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
    APP_ORIGINS: z.string().min(1),
    PUBLIC_APP_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    DATA_ENCRYPTION_KEYS: z.string().min(10),
    DATA_ACTIVE_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
    LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    SHARE_DEFAULT_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
    FIREBASE_DATABASE_URL: z.string().url().optional(),
    SMS_PROVIDER: z.enum(['disabled', 'console', 'twilio']).default('disabled'),
    SMS_API_KEY: z.string().optional(),
    SMS_ACCOUNT_SID: z.string().optional(),
    SMS_FROM_NUMBER: z.string().optional(),
    EMAIL_PROVIDER: z.enum(['disabled', 'console', 'resend']).default('disabled'),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.email().optional(),
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
    COOKIE_SECURE: booleanString.optional(),
    STATIC_DIR: z.string().optional()
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.APP_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ORIGINS'],
        message: 'Wildcard origins are forbidden in production'
      });
    }
    const entries = env.DATA_ENCRYPTION_KEYS.split(',').map((entry) => entry.trim().split(':'));
    const keys = new Map<string, Buffer>();
    for (const entry of entries) {
      const [id, encoded] = entry;
      if (!id || !encoded || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_ENCRYPTION_KEYS'],
          message: 'Invalid encryption key entry'
        });
        continue;
      }
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_ENCRYPTION_KEYS'],
          message: `Key ${id} must decode to 32 bytes`
        });
      } else {
        keys.set(id, key);
      }
    }
    if (!keys.has(env.DATA_ACTIVE_KEY_ID)) {
      ctx.addIssue({ code: 'custom', path: ['DATA_ACTIVE_KEY_ID'], message: 'Active key ID is not present' });
    }
    if (env.SMS_PROVIDER === 'twilio' && (!env.SMS_API_KEY || !env.SMS_ACCOUNT_SID || !env.SMS_FROM_NUMBER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'Twilio requires SMS_API_KEY, SMS_ACCOUNT_SID, and SMS_FROM_NUMBER'
      });
    }
    if (env.EMAIL_PROVIDER === 'resend' && (!env.EMAIL_API_KEY || !env.EMAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'Resend requires EMAIL_API_KEY and EMAIL_FROM'
      });
    }
  });

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(input: NodeJS.ProcessEnv) {
  const parsed = schema.parse(input);
  const encryptionKeys = new Map<string, Buffer>();
  for (const raw of parsed.DATA_ENCRYPTION_KEYS.split(',')) {
    const [id, encoded] = raw.trim().split(':');
    if (id && encoded) encryptionKeys.set(id, Buffer.from(encoded, 'base64'));
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    trustProxy: parsed.TRUST_PROXY,
    allowedOrigins: parsed.APP_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    publicAppUrl: parsed.PUBLIC_APP_URL.replace(/\/$/, ''),
    sessionSecret: new TextEncoder().encode(parsed.SESSION_SECRET),
    encryptionKeys,
    activeKeyId: parsed.DATA_ACTIVE_KEY_ID,
    locationRetentionDays: parsed.LOCATION_RETENTION_DAYS,
    shareDefaultTtlMinutes: parsed.SHARE_DEFAULT_TTL_MINUTES,
    firebaseProjectId: parsed.FIREBASE_PROJECT_ID,
    firebaseServiceAccountKey: parsed.FIREBASE_SERVICE_ACCOUNT_KEY,
    firebaseDatabaseUrl: parsed.FIREBASE_DATABASE_URL,
    smsProvider: parsed.SMS_PROVIDER,
    smsApiKey: parsed.SMS_API_KEY,
    smsAccountSid: parsed.SMS_ACCOUNT_SID,
    smsFromNumber: parsed.SMS_FROM_NUMBER,
    emailProvider: parsed.EMAIL_PROVIDER,
    emailApiKey: parsed.EMAIL_API_KEY,
    emailFrom: parsed.EMAIL_FROM,
    vapidPublicKey: parsed.WEB_PUSH_VAPID_PUBLIC_KEY,
    vapidPrivateKey: parsed.WEB_PUSH_VAPID_PRIVATE_KEY,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    staticDir: parsed.STATIC_DIR
  };
}
