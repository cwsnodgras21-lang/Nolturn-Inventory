import { z } from "zod";

/** Shared validation helpers. Domain schemas live with their modules. */
export const nonEmptyString = z.string().trim().min(1);

export const uuidSchema = z.string().uuid();
