let $ = x => document.querySelector(x);
let $$ = x => document.querySelectorAll(x);

$('#tabs').onclick = e => {
  let tab = e.target.getAttribute('tab');
  if (!tab) return;

  for (let g of $$('#examples .grid'))
    g.classList.toggle('active', tab == g.id);
  for (let t of $$('#tabs span'))
    t.classList.toggle('active', tab == t.getAttribute('tab'));
};
