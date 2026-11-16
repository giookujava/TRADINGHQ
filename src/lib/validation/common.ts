import { z } from "zod";

export type ActionResult = { ok?: boolean; error?: string; message?: string; id?: string };

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** Optional number from a form input: "" → null. */
export const optNum = z.preprocess(
  (v) => {
    const b = blankToNull(v);
    return b === null ? null : Number(String(b).replace(/,/g, ""));
  },
  z.number({ error: "Must be a number." }).finite().nullable(),
);

export const reqNum = z.preprocess(
  (v) => (v === "" || v == null ? NaN : Number(String(v).replace(/,/g, ""))),
  z.number({ error: "Must be a number." }).finite({ message: "Required number." }),
);

export const optText = (max = 5000) =>
  z.preprocess((v) => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s == null ? null : s;
  }, z.string().max(max).nullable());

export const reqText = (max = 200) => z.string().trim().min(1, "Required.").max(max);

/** Tri-state boolean from a select: "" → null (not recorded), "yes" → true, "no" → false. */
export const triBool = z.preprocess((v) => {
  if (v === true || v === "yes" || v === "true") return true;
  if (v === false || v === "no" || v === "false") return false;
  return null;
}, z.boolean().nullable());

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export function optEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(values).nullable());
}

export const uuid = z.uuid("Invalid id.");
export const optUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable());
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export function firstError(e: z.ZodError): string {
  const i = e.issues[0];
  const path = i.path.length ? `${i.path.join(".")}: ` : "";
  return `${path}${i.message}`;
}

/** Map common Postgres errors to friendly text. */
export function dbError(err: { message: string; code?: string } | null | undefined, what = "record"): string {
  if (!err) return "Unknown error.";
  if (err.code === "23505") return `A ${what} with these details already exists.`;
  if (err.code === "23503") return `This ${what} is still used by other records (e.g. trades). Deactivate it instead.`;
  if (err.code === "23514") return `Invalid values: ${err.message}`;
  if (err.code === "42501") return "Permission denied.";
  return err.message;
}
