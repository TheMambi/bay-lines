import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

// Shared by the tests that run in jsdom (they start with a `@vitest-environment jsdom` comment).
// jsdom has no layout, media queries or modal dialogs, so the few browser features the app asks
// for are replaced with the simplest thing that answers.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = (query) => ({
  // A desktop-width window, so the panel is open and the footer is the one in the panel.
  matches: query === '(min-width: 900px)',
  addEventListener() {},
  removeEventListener() {},
});
window.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
// No canvas here: label widths fall back to an estimate, as they do outside a browser.
HTMLCanvasElement.prototype.getContext = () => null;
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
Element.prototype.scrollTo = () => {};
// The window is 1280 by 800 with the panel in its top left corner, enough for the map to work out a view.
const box = (left, top, width, height) => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
Element.prototype.getBoundingClientRect = function () {
  return this.classList.contains('panel') ? box(16, 16, 400, 600) : box(0, 0, 1280, 800);
};

let mounted = null;

export async function mount(element) {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => root.render(element));
  return container;
}

export async function unmount() {
  if (mounted) {
    await act(async () => mounted.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
}

// dispatchEvent and not element.click(), which SVG elements such as the map's stations do not have.
export const click = (element) =>
  act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

export const pointer = (element, type, init) =>
  act(async () =>
    element.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, ...init }),
    ),
  );

// Moves the fake clock and lets timers, effects and resolved promises settle.
export const advance = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms));

export function serveAlerts(body, status = 200) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
}
