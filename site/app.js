const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
const navToggle = document.querySelector('.nav-toggle');
const navPanel = document.querySelector('.nav-panel');
const navBackdrop = document.querySelector('.nav-backdrop');
const mobileNavQuery = window.matchMedia('(max-width: 860px)');
const navFocusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

reveals.forEach((element, index) => {
  const delay = prefersReducedMotion ? 0 : index * 90;
  window.setTimeout(() => {
    element.classList.add('is-visible');
  }, delay);
});

if (navToggle && navPanel) {
  const isNavOpen = () => navPanel.classList.contains('is-open');
  let lastFocusedElement = null;

  const syncNavAria = (isOpen) => {
    if (mobileNavQuery.matches) {
      navPanel.setAttribute('aria-hidden', String(!isOpen));
    } else {
      navPanel.removeAttribute('aria-hidden');
    }
  };

  const getFocusableElements = () => {
    const panelFocusable = Array.from(navPanel.querySelectorAll(navFocusableSelector));
    return [navToggle, ...panelFocusable].filter(Boolean);
  };

  const focusFirstNavItem = () => {
    const focusable = getFocusableElements().filter((el) => el !== navToggle);
    const target = focusable[0] || navToggle;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  };

  const restoreFocus = () => {
    const target =
      lastFocusedElement && document.contains(lastFocusedElement) ? lastFocusedElement : navToggle;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
    lastFocusedElement = null;
  };

  const closeNav = () => {
    if (!isNavOpen()) {
      syncNavAria(false);
      return;
    }
    navPanel.classList.remove('is-open');
    navToggle.classList.remove('is-active');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-open');
    syncNavAria(false);
    restoreFocus();
  };

  navToggle.addEventListener('click', () => {
    if (!isNavOpen()) {
      lastFocusedElement = document.activeElement;
    }
    const isOpen = navPanel.classList.toggle('is-open');
    navToggle.classList.toggle('is-active', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', isOpen);
    syncNavAria(isOpen);
    if (isOpen && mobileNavQuery.matches) {
      window.requestAnimationFrame(focusFirstNavItem);
    }
  });

  navPanel.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      closeNav();
    }
  });

  if (navBackdrop) {
    navBackdrop.addEventListener('click', closeNav);
  }

  document.addEventListener('click', (event) => {
    if (!isNavOpen()) {
      return;
    }

    if (navPanel.contains(event.target) || navToggle.contains(event.target)) {
      return;
    }

    closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNav();
      return;
    }

    if (event.key !== 'Tab' || !isNavOpen() || !mobileNavQuery.matches) {
      return;
    }

    const focusable = getFocusableElements();
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  syncNavAria(false);

  mobileNavQuery.addEventListener('change', () => {
    if (!mobileNavQuery.matches) {
      closeNav();
    } else {
      syncNavAria(navPanel.classList.contains('is-open'));
    }
  });
}
