// Форматирование значений и HTML-фрагменты ячеек.

export const fmtMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export const fmtNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function money(value) {
  return `${fmtMoney.format(value)} ₽`;
}

// Поле суммы: цифры группами по три через неразрывный пробел — «12 500 000», как в остальных ценах на странице.
export const DIGIT_SEP = '\u00a0';

export function digitsOnly(text) {
  return String(text ?? '').replace(/\D/g, '');
}

export function groupDigits(text) {
  return digitsOnly(text).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, DIGIT_SEP);
}

// Позиция курсора сразу после n-й цифры строки (n = 0 — в начале).
export function caretAfterDigits(text, n) {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] >= '0' && text[i] <= '9' && ++seen === n) return i + 1;
  }
  return text.length;
}

export function areaText(value) {
  return `${fmtNumber.format(value)} м²`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

export function deltaBadge(delta) {
  const cls = delta < 0 ? 'good' : 'bad';
  const sign = delta > 0 ? '+' : '';
  return `<span class="badge ${cls}">${sign}${money(delta)}</span>`;
}

// Для панели квартиры и шахматки: миллионы с двумя знаками, знак изменения, проценты, короткие даты.
const fmt2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MINUS = '−';

export function mlnNumber(value) {
  return fmt2.format(value / 1e6);
}

export function mlnText(value) {
  return `${mlnNumber(value)} млн`;
}

export function signedText(value, formatter = fmtMoney) {
  const sign = value > 0 ? '+' : value < 0 ? MINUS : '';
  return sign + formatter.format(Math.abs(value));
}

// Изменение меньше 0,05% показывается как 0%, чтобы не было «−0,0%».
export function pctText(value, formatter = fmtMoney) {
  return `${signedText(Math.abs(value) < 0.05 ? 0 : value, formatter)}%`;
}

// ISO-дата ГГГГ-ММ-ДД → ДД.ММ и ДД.ММ.ГГГГ.
export function dateShort(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function dateLong(iso) {
  return `${dateShort(iso)}.${iso.slice(0, 4)}`;
}
