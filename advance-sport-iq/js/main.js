// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Sticky nav shadow on scroll
(function () {
  var nav = document.querySelector('.nav');
  var scrolled = false;
  window.addEventListener('scroll', function () {
    var s = window.scrollY > 8;
    if (s !== scrolled) {
      scrolled = s;
      nav.style.boxShadow = s ? '0 1px 0 rgba(11, 30, 59, 0.08), 0 8px 24px rgba(11, 30, 59, 0.04)' : 'none';
    }
  });
})();

// Form submit handler — for now just opens an email client with the content
function submitForm(event) {
  event.preventDefault();
  var f = event.target;
  var name = (f.name.value || '').trim();
  var email = (f.email.value || '').trim();
  var program = (f.program.value || '').trim();
  var role = (f.role.value || '').trim();
  var message = (f.message.value || '').trim();

  var subject = encodeURIComponent('Discovery call request — ' + (program || name));
  var body = encodeURIComponent(
    'Name: ' + name + '\n' +
    'Email: ' + email + '\n' +
    'Program / Organization: ' + program + '\n' +
    'Role: ' + role + '\n\n' +
    'What we are trying to solve:\n' + message + '\n'
  );
  window.location.href = 'mailto:kevin@advancesportiq.com?subject=' + subject + '&body=' + body;
  return false;
}
