'use strict';

// Presentation controls only. No account, billing or product-data requests.
document.querySelectorAll('[data-billing]').forEach(function (button) {
  button.addEventListener('click', function () {
    var period = button.dataset.billing;
    document.querySelectorAll('[data-billing]').forEach(function (option) {
      option.setAttribute('aria-pressed', String(option === button));
    });
    document.querySelectorAll('[data-period]').forEach(function (panel) {
      panel.hidden = panel.dataset.period !== period;
    });
  });
});

(function () {
  var search = document.querySelector('[data-tool-search]');
  if (!search) return;
  var cards = Array.from(document.querySelectorAll('[data-tool]'));
  var filters = Array.from(document.querySelectorAll('[data-filter]'));
  var counter = document.querySelector('[data-catalog-count]');
  var empty = document.querySelector('[data-empty]');
  var category = 'all';
  function filterTools() {
    var query = search.value.trim().toLocaleLowerCase(document.documentElement.lang);
    var visible = 0;
    cards.forEach(function (card) {
      var matchesCategory = category === 'all' || card.dataset.category === category;
      var matchesText = card.textContent.toLocaleLowerCase(document.documentElement.lang).includes(query);
      card.hidden = !(matchesCategory && matchesText);
      if (!card.hidden) visible += 1;
    });
    counter.textContent = counter.dataset.template.replace('{n}', String(visible));
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', filterTools);
  filters.forEach(function (button) {
    button.addEventListener('click', function () {
      category = button.dataset.filter;
      filters.forEach(function (option) { option.setAttribute('aria-pressed', String(option === button)); });
      filterTools();
    });
  });
})();
