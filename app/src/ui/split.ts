/** Режем заголовок на слова в «масках»: слова выезжают снизу. Неразрывные пробелы остаются внутри слова. */
export function splitHeading(el: HTMLElement) {
  if (el.dataset.splitDone) return;
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text.replace(/ /g, ' '));
  el.textContent = '';
  const words = text.split(' ');
  words.forEach((w, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'w';
    wrap.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.textContent = w;
    inner.style.setProperty('--i', String(i));
    wrap.appendChild(inner);
    el.appendChild(wrap);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  el.dataset.splitDone = '1';
  el.classList.add('is-split');
}

/** Слова цитаты: каждое в своём span, чтобы зажигать по мере прокрутки. */
export function splitWords(el: HTMLElement, cls = 'qw'): HTMLElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const out: HTMLElement[] = [];
  text.split(' ').forEach((w, i, arr) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = w;
    el.appendChild(s);
    out.push(s);
    if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return out;
}
