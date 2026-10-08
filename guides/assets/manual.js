'use strict';
(() => {
  document.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('details').forEach(d => d.open = true);
    window.print();
  }));
  const search = document.querySelector('[data-manual-search]');
  const chapters = Array.from(document.querySelectorAll('[data-chapter]'));
  const empty = document.querySelector('[data-empty]');
  if (search) {
    function filter() {
      const query = search.value.trim().toLocaleLowerCase(document.documentElement.lang);
      let n = 0;
      chapters.forEach(c => { c.hidden = !c.textContent.toLocaleLowerCase(document.documentElement.lang).includes(query); if (!c.hidden) n++; });
      empty.hidden = n > 0;
    }
    search.addEventListener('input', filter);
    document.querySelector('[data-clear-search]').addEventListener('click', () => {search.value='';filter();search.focus();});
    document.querySelectorAll('.toc a').forEach(a => a.addEventListener('click', () => {search.value='';filter();}));
    window.addEventListener('hashchange', () => {search.value='';filter();});
  }
  const checks = Array.from(document.querySelectorAll('[data-complete]'));
  const count = document.querySelector('[data-progress-count]');
  const bar = document.querySelector('progress');
  function progress() {
    const n = checks.filter(c => c.checked).length;
    if (count) count.textContent = n + ' / ' + checks.length;
    if (bar) { bar.max=checks.length;bar.value=n; }
  }
  checks.forEach(c => c.addEventListener('change',progress));progress();
})();
