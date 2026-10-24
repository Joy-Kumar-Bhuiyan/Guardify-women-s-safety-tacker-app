import { z } from 'zod';

export const idParams = z.strictObject({ id: z.string().uuid() });
export const tokenParams = z.strictObject({ token: z.string().min(32).max(128) });
export const paginationQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const locationSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
  capturedAt: z.iso.datetime().optional()
});

export const nearbyHelpSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const contactFields = {
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(30).optional(),
  email: z.email().max(254).optional(),
  channels: z
    .array(z.enum(['sms', 'email', 'push']))
    .min(1)
    .max(3)
};

export const contactCreateSchema = z
  .strictObject(contactFields)
  .refine((value) => Boolean(value.phone || value.email), { message: 'A phone number or email is required' });

export const contactUpdateSchema = z
  .strictObject(contactFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const shareStartSchema = z.strictObject({
  contactIds: z.array(z.string().uuid()).min(1).max(10),
  expiresInMinutes: z.number().int().min(5).max(1440).optional(),
  consentAccepted: z.literal(true),
  purpose: z.string().trim().min(1).max(120).default('Live safety sharing')
});

export const sosSchema = z.strictObject({
  location: locationSchema,
  message: z.string().trim().max(280).optional(),
  contactIds: z.array(z.string().uuid()).max(10).optional()
});

export const journeyCreateSchema = z.strictObject({
  destination: z.string().trim().min(1).max(200),
  expectedArrivalAt: z.iso.datetime(),
  graceMinutes: z.number().int().min(0).max(120).default(15),
  contactIds: z.array(z.string().uuid()).min(1).max(10),
  startLocation: locationSchema.optional()
});

export const checkinCreateSchema = z.strictObject({
  promptAt: z.iso.datetime(),
  graceMinutes: z.number().int().min(1).max(120).default(10),
  contactIds: z.array(z.string().uuid()).min(1).max(10),
  note: z.string().trim().max(160).optional()
});
