// 觸控／滑鼠：單指拖曳、雙指縮放與旋轉、點一下、滾輪縮放、滑鼠右鍵拖曳旋轉

export interface InputHandlers {
  onTap(x: number, y: number): void;
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, x: number, y: number): void;
  /** 雙指旋轉（弧度） */
  onRotate?(delta: number): void;
}

const TAP_SLOP = 10;

export function attachInput(el: HTMLElement, h: InputHandlers): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let downPos: { x: number; y: number } | null = null;
  let dragging = false;
  let pinchDist = 0;
  let multi = false;

  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  // 滑鼠右鍵：左右拖曳旋轉視角
  let rightDrag: { x: number } | null = null;

  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    if (e.pointerType === 'mouse' && e.button === 2) {
      rightDrag = { x: p.x };
      return;
    }
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downPos = p;
      dragging = false;
      multi = false;
    } else if (pointers.size === 2) {
      multi = true;
      pinchDist = pinchInfo().dist;
    }
  };

  const move = (e: PointerEvent) => {
    if (rightDrag) {
      const p = local(e);
      h.onRotate?.((p.x - rightDrag.x) * 0.008);
      rightDrag.x = p.x;
      return;
    }
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (pointers.size === 2) {
      const before = pinchInfo();
      pointers.set(e.pointerId, p);
      const after = pinchInfo();
      if (pinchDist > 0) h.onZoom(after.dist / before.dist, after.mx, after.my);
      let da = after.angle - before.angle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      h.onRotate?.(da);
      h.onPan(after.mx - before.mx, after.my - before.my);
      pinchDist = after.dist;
      return;
    }
    pointers.set(e.pointerId, p);
    if (!downPos || multi) return;
    if (!dragging && Math.hypot(p.x - downPos.x, p.y - downPos.y) > TAP_SLOP) dragging = true;
    if (dragging) h.onPan(p.x - prev.x, p.y - prev.y);
  };

  const up = (e: PointerEvent) => {
    if (rightDrag && e.pointerType === 'mouse') {
      rightDrag = null;
      return;
    }
    const had = pointers.delete(e.pointerId);
    if (!had) return;
    if (pointers.size === 0) {
      if (!dragging && !multi && downPos && e.type === 'pointerup') {
        const p = local(e);
        h.onTap(p.x, p.y);
      }
      downPos = null;
      dragging = false;
    }
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    h.onZoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  const noMenu = (e: Event) => e.preventDefault();
  el.addEventListener('contextmenu', noMenu);
  return () => {
    el.removeEventListener('contextmenu', noMenu);
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}
