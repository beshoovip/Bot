// أداة بناء DOM آمنة: النصوص دائمًا عبر textContent (لا innerHTML) فلا ثغرة XSS من أسماء اللاعبين/الدردشة.

export function h(tag, attrs = {}, ...kids) {
  const el = (attrs?.ns ? document.createElementNS(attrs.ns, tag) : document.createElement(tag));
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false || k === 'ns') continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export const fmt = (n) => Number(n ?? 0).toLocaleString('ar-EG');
