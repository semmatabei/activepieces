/** Pure field-type classification logic without Activepieces framework dependencies. */

export type FieldPropertyType = "NUMBER" | "SHORT_TEXT";

export function classifyFieldType(type: string): FieldPropertyType {
  if (type === "number" || type === "currency") {
    return "NUMBER";
  }
  return "SHORT_TEXT";
}
