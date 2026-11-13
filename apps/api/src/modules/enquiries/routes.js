// Enquiries (experiences/dining) and newsletter signups - persisted, no external send in M1.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { validate, writeLimiter } from '../../middleware/index.js';
import { enquirySchema, newsletterSchema } from '@stillhouse/shared';
import { audit } from '../../lib/audit.js';

export const enquiriesRouter = Router();

enquiriesRouter.post('/enquiries', writeLimiter, validate(enquirySchema), async (req, res, next) => {
  try {
    const { kind, subject, name, email, date, guests, message } = req.validatedBody;
    const enquiry = await prisma.enquiry.create({
      data: { kind, subject, name, email, date: date ? new Date(`${date}T00:00:00.000Z`) : null, guests, message },
    });
    await audit(null, { action: 'enquiry.created', entity: 'enquiry', entityId: enquiry.id, ip: req.ip });
    res.status(201).json({ id: enquiry.id });
  } catch (err) { next(err); }
});

enquiriesRouter.post('/newsletter', writeLimiter, validate(newsletterSchema), async (req, res, next) => {
  try {
    const { email } = req.validatedBody;
    await prisma.newsletterSubscriber.upsert({ where: { email }, create: { email }, update: {} });
    res.json({ subscribed: true });
  } catch (err) { next(err); }
});
