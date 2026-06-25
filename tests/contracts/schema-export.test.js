const assert = require('assert');
const fs = require('fs');
const {
  listContracts,
  loadFixture,
  loadSchema,
  resolveContractPath,
} = require('../../src/contracts');

function assertSchemaAndFixtureExist() {
  const contracts = listContracts();
  assert.strictEqual(contracts.length, 5);
  for (const contract of contracts) {
    assert(fs.existsSync(contract.schemaPath), `${contract.kind} schema 应存在`);
    assert(fs.existsSync(contract.fixturePath), `${contract.kind} fixture 应存在`);
    const schema = loadSchema(contract.kind);
    const fixture = loadFixture(contract.kind);
    assert.strictEqual(schema.type, 'object');
    for (const field of schema.required || []) {
      assert(Object.prototype.hasOwnProperty.call(fixture, field), `${contract.kind} fixture 缺少必填字段 ${field}`);
    }
  }
}

function assertRunEventSchemaWasExported() {
  const schema = loadSchema('runEvent');
  const fixture = loadFixture('runEvent');
  assert(resolveContractPath('runEvent', 'schema').endsWith('contracts/schemas/run-event.schema.json'));
  assert(schema.properties.eventType);
  assert(schema.properties.timestamp);
  assert.strictEqual(fixture.eventType, 'hook.finished');
  assert.strictEqual(fixture.metadata.hookId, 'post-test');
}

function main() {
  assertSchemaAndFixtureExist();
  assertRunEventSchemaWasExported();
  console.log('schema-export tests passed');
}

main();
