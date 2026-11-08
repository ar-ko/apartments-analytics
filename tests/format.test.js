import { caretAfterDigits, digitsOnly, groupDigits } from '../js/format.js';
import { assert, test } from './runner.js';

const plain = s => s.replace(/ /g, ' ');

test('поле суммы: цифры группами по три, лишнее отбрасывается', () => {
  assert.equal(plain(groupDigits('9000000')), '9 000 000');
  assert.equal(plain(groupDigits('12 5005')), '125 005');
  assert.equal(plain(groupDigits('1 234 567 8')), '12 345 678');
  assert.equal(groupDigits('999'), '999');
  assert.equal(groupDigits('007'), '7', 'ведущие нули не нужны');
  assert.equal(groupDigits('0'), '0');
  assert.equal(groupDigits('руб.'), '');
  assert.equal(digitsOnly('9 000 000'), '9000000');
});

test('поле суммы: курсор встаёт после той же по счёту цифры', () => {
  const text = groupDigits('1234567'); // «1 234 567»
  assert.equal(caretAfterDigits(text, 0), 0);
  assert.equal(caretAfterDigits(text, 1), 1);
  assert.equal(caretAfterDigits(text, 2), 3, 'после «1 2»');
  assert.equal(caretAfterDigits(text, 7), 9);
  assert.equal(caretAfterDigits(text, 99), 9);
});
