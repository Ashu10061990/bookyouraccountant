import { z } from "zod";

/**
 * A service in the catalogue.
 *
 * `id` is a stable slug, not a generated key: the pricing engine, SOP
 * templates and assignment validator all reference services by these exact
 * strings, and migrated documents carry them too.
 */
export const serviceSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "service id must be a lowercase slug"),
  name: z.string().min(1),
  /**
   * Soft-delete flag. The catalogue is referenced by historical assignments,
   * so a service is retired by clearing this, never by deleting the row —
   * deleting would leave completed work pointing at nothing.
   */
  active: z.boolean().default(true),
});

export const createServiceSchema = serviceSchema;

export const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export type Service = z.infer<typeof serviceSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
