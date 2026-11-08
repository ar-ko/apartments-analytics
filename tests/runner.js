// Минимальный раннер тестов для браузера, без зависимостей.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export const assert = {
  equal(actual, expected, message = '') {
    if (!Object.is(actual, expected)) {
      throw new Error(`${message} ожидалось ${format(expected)}, получено ${format(actual)}`.trim());
    }
  },
  deepEqual(actual, expected, message = '') {
    if (format(actual) !== format(expected)) {
      throw new Error(`${message} ожидалось ${format(expected)}, получено ${format(actual)}`.trim());
    }
  },
  ok(value, message = 'ожидалось истинное значение') {
    if (!value) throw new Error(message);
  },
};

export async function run(output) {
  const lines = [];
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      lines.push(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      lines.push(`✗ ${name}\n    ${error.message}`);
    }
  }
  const summary = failed ? `FAIL: ${failed} из ${tests.length}` : `OK: ${tests.length} тестов`;
  output.textContent = `${summary}\n\n${lines.join('\n')}`;
  output.dataset.result = failed ? 'fail' : 'ok';
  document.title = summary;
}

function format(value) {
  return JSON.stringify(value, (_, v) => (v === Infinity ? 'Infinity' : v));
}
