(() => {
  'use strict';
  document.querySelectorAll('[data-password-target]').forEach(button => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input) return;
    const hide = () => {
      input.type = 'password';
      button.textContent = 'Mostrar';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Mostrar senha');
    };
    button.onclick = () => {
      if (input.type === 'text') return hide();
      input.type = 'text';
      button.textContent = 'Ocultar';
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', 'Ocultar senha');
    };
    input.form?.addEventListener('submit', hide);
    input.form?.addEventListener('reset', hide);
  });
  const pickers = [...document.querySelectorAll('.filter-picker details')];
  document.addEventListener('click', event => {
    pickers.forEach(picker => { if (!picker.contains(event.target)) picker.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const current = pickers.find(picker => picker.open && picker.contains(document.activeElement));
    pickers.forEach(picker => { picker.open = false; });
    current?.querySelector('summary').focus();
  });
})();
