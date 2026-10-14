import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $ } from '../ui/dom';
import { env } from '../core/env';

/** Телефон в финале: цифры выезжают снизу, а под мышью «волной» приподнимаются. */
export function initContact() {
  const phone = $('#phone');
  if (!phone) return;
  const text = phone.textContent ?? '';
  phone.textContent = '';
  const digits = [...text].map((ch) => {
    const s = document.createElement('span');
    s.className = 'd';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch;
    phone.appendChild(s);
    return s;
  });
  if (env.reduced) return;

  gsap.set(digits, { yPercent: 70, opacity: 0 });
  ScrollTrigger.create({
    trigger: phone,
    start: 'top 90%',
    once: true,
    onEnter: () => gsap.to(digits, { yPercent: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.04 }),
  });

  if (!env.fine) return;
  const qy = digits.map((d) => gsap.quickTo(d, 'y', { duration: 0.55, ease: 'power3.out' }));
  const qs = digits.map((d) => gsap.quickTo(d, 'scale', { duration: 0.55, ease: 'power3.out' }));
  let centers: number[] = [];
  phone.addEventListener('pointerenter', () => {
    centers = digits.map((d) => {
      const r = d.getBoundingClientRect();
      return r.left + r.width / 2;
    });
  });
  phone.addEventListener('pointermove', (e) => {
    for (let i = 0; i < digits.length; i++) {
      const k = Math.max(0, 1 - Math.abs(e.clientX - centers[i]) / 240);
      qy[i](-k * k * 30);
      qs[i](1 + k * 0.1);
    }
  });
  phone.addEventListener('pointerleave', () => {
    for (let i = 0; i < digits.length; i++) {
      qy[i](0);
      qs[i](1);
    }
  });
}
