document.addEventListener('DOMContentLoaded', () => {
  // 1. Scroll Reveal Observer
  const revealElements = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback if IntersectionObserver is not supported
    revealElements.forEach(el => el.classList.add('revealed'));
  }

  // 2. Navbar Sticky Scroll Logic
  const header = document.querySelector('.navbar');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('nav-scrolled');
      } else {
        header.classList.remove('nav-scrolled');
      }
    });
  }

  // 3. Side Drawer Actions
  const sideDrawer = document.getElementById('mobile-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerOpenBtn = document.getElementById('drawer-open-btn');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');

  function openDrawer() {
    if (sideDrawer && drawerBackdrop) {
      sideDrawer.classList.remove('translate-x-full');
      sideDrawer.classList.add('translate-x-0');
      drawerBackdrop.classList.remove('opacity-0', 'pointer-events-none');
      drawerBackdrop.classList.add('opacity-100');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDrawer() {
    if (sideDrawer && drawerBackdrop) {
      sideDrawer.classList.remove('translate-x-0');
      sideDrawer.classList.add('translate-x-full');
      drawerBackdrop.classList.remove('opacity-100');
      drawerBackdrop.classList.add('opacity-0', 'pointer-events-none');
      document.body.style.overflow = 'unset';
    }
  }

  if (drawerOpenBtn) drawerOpenBtn.addEventListener('click', openDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // 4. FAQ Accordion Toggle
  const faqButtons = document.querySelectorAll('.faq-btn');
  faqButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.nextElementSibling;
      const arrow = btn.querySelector('.faq-arrow');
      
      // Close other FAQs if open
      faqButtons.forEach((otherBtn) => {
        if (otherBtn !== btn) {
          const otherPanel = otherBtn.nextElementSibling;
          const otherArrow = otherBtn.querySelector('.faq-arrow');
          if (otherPanel) {
            otherPanel.style.maxHeight = null;
          }
          if (otherArrow) {
            otherArrow.classList.remove('rotate-180');
          }
        }
      });

      if (panel) {
        if (panel.style.maxHeight) {
          panel.style.maxHeight = null;
          if (arrow) arrow.classList.remove('rotate-180');
        } else {
          panel.style.maxHeight = panel.scrollHeight + 'px';
          if (arrow) arrow.classList.add('rotate-180');
        }
      }
    });
  });
});
