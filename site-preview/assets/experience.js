'use strict';
(function () {
  const shell = document.querySelector('.command-shell');
  if (!shell) return;
  const panels = Array.from(shell.querySelectorAll('[data-scene-panel]'));
  const buttons = Array.from(shell.querySelectorAll('[data-scene]'));
  const toggle = document.querySelector('[data-tour-toggle]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches, active = 0, timer;
  function show(index) {
    active = (index + panels.length) % panels.length;
    panels.forEach((panel, i) => {
      panel.classList.toggle('on', i === active);
      panel.setAttribute('aria-hidden', String(i !== active));
    });
    buttons.forEach((button, i) => {
      button.classList.toggle('on', i === active);
      button.setAttribute('aria-pressed', String(i === active));
    });
  }
  function schedule() {
    clearInterval(timer);
    const run = playing && !document.hidden;
    shell.classList.toggle('playing', run);
    toggle.textContent = playing ? toggle.dataset.pause : toggle.dataset.play;
    toggle.setAttribute('aria-pressed', String(playing));
    if (run) timer = setInterval(() => show(active + 1), 4600);
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    playing = false; show(i); schedule();
  }));
  toggle.addEventListener('click', () => { playing = !playing; schedule(); });
  motion.addEventListener('change', () => { playing = !motion.matches; schedule(); });
  document.addEventListener('visibilitychange', schedule);
  show(0); schedule();
})();
(function () {
  function revealHash() {
    if (location.hash === '#pricing') {
      const prices = document.getElementById('pricing');
      if (prices) prices.open = true;
    }
  }
  window.addEventListener('hashchange', revealHash);
  document.querySelectorAll('a[href="#pricing"]').forEach(a => a.addEventListener('click', () => {
    const prices = document.getElementById('pricing');
    if (prices) prices.open = true;
  }));
  revealHash();
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
  const prepare = document.querySelector('[data-prepare-question]');
  if (!prepare) return;
  const topic = document.getElementById('guide-topic');
  const question = document.getElementById('guide-question');
  const status = document.querySelector('[data-copy-status]');
  function fill() {
    const template = document.querySelector('[data-guide-prompt="' + topic.value + '"]');
    question.value = template.content.textContent;
    document.querySelector('[data-ai-question]').hidden = false;
    status.textContent = '';
  }
  prepare.addEventListener('click', () => { fill(); question.focus(); });
  topic.addEventListener('change', () => {
    if (!document.querySelector('[data-ai-question]').hidden) fill();
  });
  const copy = document.querySelector('[data-copy-question]');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(question.value);
      status.textContent = copy.dataset.success;
    } catch (_) {
      question.focus(); question.select(); status.textContent = copy.dataset.fallback;
    }
  });
})();
