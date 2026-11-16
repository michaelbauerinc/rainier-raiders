import assert from "node:assert/strict";
import test from "node:test";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../db/auth-schema.ts";

test("Drizzle auth tables match the installed Better Auth database contract", () => {
  const expected = getAuthTables({
    rateLimit: { storage: "database" },
    user: { additionalFields: { blocked: { type: "boolean", defaultValue: false, input: false, returned: false } } },
  });
  assert.deepEqual(Object.keys(schema).sort(), Object.keys(expected).sort());
  for (const [name, table] of Object.entries(expected)) {
    const columns = getTableColumns(schema[name]);
    assert.equal(columns.id.primary, true, `${name}.id`);
    for (const [field, contract] of Object.entries(table.fields)) {
      assert.ok(columns[field], `${name}.${field} exists`);
      assert.equal(columns[field].dataType, contract.type, `${name}.${field} type`);
      if (contract.required) assert.equal(columns[field].notNull, true, `${name}.${field} required`);
    }
  }
});
