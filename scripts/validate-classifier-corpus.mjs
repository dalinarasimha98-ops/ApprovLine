import fs from 'node:fs';

const file = new URL('../tests/fixtures/classifier-enterprise-cases.json', import.meta.url);
const cases = JSON.parse(fs.readFileSync(file, 'utf8'));
const requiredCategories = ['Finance', 'Procurement', 'Legal', 'HR', 'Engineering', 'Security', 'Compliance'];
const requiredTypes = ['explicit', 'implicit', 'conditional', 'rejection', 'escalation', 'not_approval'];

if (cases.length !== 100) {
  throw new Error(`Expected 100 classifier cases, found ${cases.length}`);
}

const ids = new Set(cases.map((item) => item.id));
if (ids.size !== cases.length) {
  throw new Error('Classifier case ids must be unique');
}

for (const category of requiredCategories) {
  if (!cases.some((item) => item.category === category)) {
    throw new Error(`Missing category coverage: ${category}`);
  }
}

for (const type of requiredTypes) {
  if (!cases.some((item) => item.expected === type)) {
    throw new Error(`Missing approval type coverage: ${type}`);
  }
}

console.log(`Validated ${cases.length} enterprise classifier cases.`);
