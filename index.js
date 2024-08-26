let $ = x => document.querySelector(x);

$('#tabs').onclick = e => {
  let tab = e.target.getAttribute('tab');
  if (tab) $('#examples').setAttribute('tab', tab);
};
