import { z } from 'zod';

const userIdSchema = z.string().min(1).max(128);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const categorySchema = z.enum(['ingredients', 'prize', 'other']);

export const googleAuthSchema = z.object({
  credential: z.string().min(1),
});

export const appleAuthSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1).optional(),
  user: z
    .object({
      name: z
        .object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        })
        .optional(),
      email: z.string().email().optional(),
    })
    .optional(),
});

export const splitParticipantSchema = z.object({
  userId: userIdSchema,
  shareAmount: z.number().int().nonnegative().optional(),
  ratio: z.number().positive().optional(),
});

export const expenseCreateSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  amount: z.number().int().positive(),
  currency: z.literal('TWD').default('TWD'),
  paidByUserId: userIdSchema,
  category: categorySchema.default('other'),
  expenseDate: isoDateSchema,
  splitMethod: z.enum(['equal', 'custom', 'ratio']),
  participants: z.array(splitParticipantSchema).min(1),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const expenseUpdateSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    amount: z.number().int().positive().optional(),
    category: categorySchema.optional(),
    expenseDate: isoDateSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided.',
  });

export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

export const memberPatchSchema = z
  .object({
    role: z.enum(['member', 'admin']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'At least one field must be provided.',
  });

export const paymentCreateSchema = z.object({
  fromUserId: userIdSchema,
  toUserId: userIdSchema,
  amount: z.number().int().positive(),
  note: z.string().max(500).optional(),
});
