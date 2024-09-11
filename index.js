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

for (let a of $$('.grid > a')) {
  let img = a.querySelector('img');
  if (!a.href && img.src) {
    let filename = img.src.split('/').slice(-1)[0].split('.')[0];
    let keynote = img.className;
    a.href = 'preview?src=' + filename + '&c=' + keynote;
  }
}
