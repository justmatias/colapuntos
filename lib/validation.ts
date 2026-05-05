import { z } from "zod";

export const zObjectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID inválido");
