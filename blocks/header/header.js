/* eslint-disable no-use-before-define */
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const isDesktop = window.matchMedia('(min-width: 900px)');

/* ================= FIX 1: DEFINE FUNCTIONS FIRST ================= */

function toggleAllNavSections(sections, expanded = false) {
  sections
    .querySelectorAll('.nav-sections .default-content-wrapper > ul > li')
    .forEach((section) => section.setAttribute('aria-expanded', expanded));
}
/* ================= REST FUNCTIONS ================= */

function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null
    ? !forceExpanded
    : nav.getAttribute('aria-expanded') === 'true';

  const button = nav.querySelector('.nav-hamburger button');

  document.body.style.overflowY = expanded || isDesktop.matches ? '' : 'hidden';

  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');

  toggleAllNavSections(
    navSections,
    expanded || isDesktop.matches ? 'false' : 'true',
  );

  button.setAttribute(
    'aria-label',
    expanded ? 'Open navigation' : 'Close navigation',
  );

  const navDrops = navSections.querySelectorAll('.nav-drop');
  function focusNavSection() {
    document.activeElement.addEventListener('keydown', openOnKeydown);
  }

  if (isDesktop.matches) {
    navDrops.forEach((drop) => {
      if (!drop.hasAttribute('tabindex')) {
        drop.setAttribute('tabindex', 0);
        drop.addEventListener('focus', focusNavSection);
      }
    });
  } else {
    navDrops.forEach((drop) => {
      drop.removeAttribute('tabindex');
      drop.removeEventListener('focus', focusNavSection);
    });
  }

  if (!expanded || isDesktop.matches) {
    window.addEventListener('keydown', closeOnEscape);
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}
function closeOnFocusLost(e) {
  const nav = e.currentTarget;

  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');

    const navSectionExpanded = navSections.querySelector(
      '[aria-expanded="true"]',
    );

    if (navSectionExpanded && isDesktop.matches) {
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      toggleMenu(nav, navSections, false);
    }
  }
}

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');

    const navSectionExpanded = navSections.querySelector(
      '[aria-expanded="true"]',
    );

    if (navSectionExpanded && isDesktop.matches) {
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}
function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';

  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';

    toggleAllNavSections(focused.closest('.nav-sections'));

    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

/* ================= HEADER BAR ================= */

function buildHeaderBar() {
  const bar = document.createElement('div');
  bar.className = 'header-bar';

  const logoImg = document.createElement('img');
  logoImg.src = '/content/dam/myhdfc/hdfc-logo.svg';
  logoImg.alt = 'HDFC Bank';
  logoImg.className = 'header-bar__logo';
  logoImg.width = 130;
  logoImg.height = 30;
  logoImg.loading = 'eager';

  const badgeImg = document.createElement('img');
  badgeImg.src = '/content/dam/myhdfc/100hdfc.png';
  badgeImg.alt = '100% Safe and Secure';
  badgeImg.className = 'header-bar__badge';
  badgeImg.width = 120;
  badgeImg.height = 30;
  badgeImg.loading = 'eager';

  bar.append(logoImg, badgeImg);
  return bar;
}

/* ================= MAIN ================= */

export default async function decorate(block) {
  block.textContent = '';

  block.append(buildHeaderBar());

  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';

  const fragment = await loadFragment(navPath);

  const nav = document.createElement('nav');
  nav.id = 'nav';

  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = ['brand', 'sections', 'tools'];

  classes.forEach((c, i) => {
    if (nav.children[i]) nav.children[i].classList.add(`nav-${c}`);
  });

  const navBrand = nav.querySelector('.nav-brand');
  const brandLink = navBrand?.querySelector('.button');

  if (brandLink) {
    brandLink.className = '';
    brandLink.closest('.button-container').className = '';
  }

  const navSections = nav.querySelector('.nav-sections');

  if (navSections) {
    navSections
      .querySelectorAll(':scope .default-content-wrapper > ul > li')
      .forEach((navSection) => {
        if (navSection.querySelector('ul')) {
          navSection.classList.add('nav-drop');
        }

        navSection.addEventListener('click', () => {
          if (isDesktop.matches) {
            const expanded = navSection.getAttribute('aria-expanded') === 'true';

            toggleAllNavSections(navSections);

            navSection.setAttribute(
              'aria-expanded',
              expanded ? 'false' : 'true',
            );
          }
        });
      });
  }

  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');

  /* FIX 2: CLEAN STRING (NO IRREGULAR WHITESPACE) */
  hamburger.innerHTML = `
    <button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>
  `;

  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));

  nav.prepend(hamburger);

  nav.setAttribute('aria-expanded', 'false');

  toggleMenu(nav, navSections, isDesktop.matches);

  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);

  block.append(navWrapper);
}
 