import type { RuntimeError } from "../runtime/types.js";
import type { RuntimeJsonSchema, RuntimeJsonSchemaProperty } from "./types.js";

export function validateActionPayload(
  schema: RuntimeJsonSchema | undefined,
  payload: Record<string, unknown> | undefined
): RuntimeError | undefined {
  if (schema === undefined) {
    return undefined;
  }

  const value = payload ?? {};
  return validateObjectSchema(schema, value, "payload");
}

function validateObjectSchema(
  schema: RuntimeJsonSchema,
  value: unknown,
  path: string
): RuntimeError | undefined {
  if (!isPlainObject(value)) {
    return createValidationError(`${path} must be an object`);
  }

  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of required) {
    if (!(key in value)) {
      return createValidationError(`${path}.${key} is required`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        return createValidationError(`${path}.${key} is not allowed`);
      }
    }
  }

  for (const [key, property] of Object.entries(properties)) {
    if (key in value) {
      const error = validateProperty(property, value[key], `${path}.${key}`);
      if (error !== undefined) {
        return error;
      }
    }
  }

  return undefined;
}

function validateProperty(
  property: RuntimeJsonSchemaProperty,
  value: unknown,
  path: string
): RuntimeError | undefined {
  if (property.enum !== undefined && !property.enum.includes(value as string | number | boolean)) {
    return createValidationError(`${path} must be one of the declared enum values`);
  }

  switch (property.type) {
    case "string":
      return typeof value === "string" ? undefined : createValidationError(`${path} must be a string`);
    case "number":
      return typeof value === "number" ? undefined : createValidationError(`${path} must be a number`);
    case "boolean":
      return typeof value === "boolean" ? undefined : createValidationError(`${path} must be a boolean`);
    case "array":
      return validateArrayProperty(property, value, path);
    case "object":
      return validateNestedObjectProperty(property, value, path);
  }
}

function validateArrayProperty(
  property: RuntimeJsonSchemaProperty,
  value: unknown,
  path: string
): RuntimeError | undefined {
  if (!Array.isArray(value)) {
    return createValidationError(`${path} must be an array`);
  }

  if (property.items === undefined) {
    return undefined;
  }

  for (let index = 0; index < value.length; index += 1) {
    const error = validateProperty(property.items, value[index], `${path}[${index}]`);
    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
}

function validateNestedObjectProperty(
  property: RuntimeJsonSchemaProperty,
  value: unknown,
  path: string
): RuntimeError | undefined {
  const schema: RuntimeJsonSchema = {
    type: "object"
  };

  if (property.properties !== undefined) schema.properties = property.properties;
  if (property.required !== undefined) schema.required = property.required;
  if (property.additionalProperties !== undefined) {
    schema.additionalProperties = property.additionalProperties;
  }

  return validateObjectSchema(schema, value, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createValidationError(message: string): RuntimeError {
  return {
    message,
    code: "action_payload_invalid"
  };
}
