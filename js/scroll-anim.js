// Плавная прокрутка шахматки: одна анимация на горизонталь доски и вертикаль страницы.
// Новая команда во время анимации не дёргает назад: движение продолжается от текущей точки к новой цели.

export const easeInOut = t => (1 - Math.cos(Math.PI * t)) / 2;
export const easeOut = t => Math.sin(Math.PI * t / 2);

const DURATION_MS = 400;
const DURATION_CHAINED_MS = 320;

export function createBoardScroller(getBoard) {
  const state = { raf: null, toLeft: 0, toY: 0 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Цели считаются от уже назначенной цели, а не от кадра посреди анимации.
  const baseLeft = () => (state.raf != null ? state.toLeft : getBoard()?.scrollLeft ?? 0);
  const baseY = () => (state.raf != null ? state.toY : window.scrollY);

  function cancel() {
    if (state.raf != null) cancelAnimationFrame(state.raf);
    state.raf = null;
  }

  // null — оставить координату как есть.
  function scrollTo(toLeft, toY) {
    const board = getBoard();
    if (!board) return;
    const maxLeft = board.scrollWidth - board.clientWidth;
    const maxY = document.documentElement.scrollHeight - innerHeight;
    toLeft = clamp(toLeft ?? baseLeft(), 0, maxLeft);
    toY = clamp(toY ?? baseY(), 0, maxY);
    const chained = state.raf != null;
    cancel();
    state.toLeft = toLeft;
    state.toY = toY;
    const fromLeft = board.scrollLeft;
    const fromY = window.scrollY;
    const dLeft = toLeft - fromLeft;
    const dY = toY - fromY;
    if (Math.abs(dLeft) < 1 && Math.abs(dY) < 1) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      board.scrollLeft = toLeft;
      window.scrollTo(0, toY);
      return;
    }
    const duration = chained ? DURATION_CHAINED_MS : DURATION_MS;
    const ease = chained ? easeOut : easeInOut;
    // Отсчёт с первого кадра: метка времени кадра бывает раньше момента вызова, и иначе первые шаги шли бы назад.
    let t0 = null;
    const step = now => {
      if (t0 === null) t0 = now - 16;
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const k = ease(p);
      board.scrollLeft = fromLeft + dLeft * k;
      window.scrollTo(0, fromY + dY * k);
      state.raf = p < 1 ? requestAnimationFrame(step) : null;
    };
    state.raf = requestAnimationFrame(step);
  }

  return { scrollTo, baseLeft, baseY, cancel, isAnimating: () => state.raf != null };
}
