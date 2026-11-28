const form = document.getElementById('loginForm');
const password = document.getElementById('password');
const toggle = document.getElementById('togglePassword');
const button = document.getElementById('signIn');
const buttonText = document.getElementById('buttonText');
const spinner = document.getElementById('spinner');
const message = document.getElementById('message');

toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.setAttribute('aria-label',
    visible ? 'Hide password' : 'Show password');
  document.getElementById('eyeSlash').hidden = !visible;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;

  button.disabled = true;
  spinner.hidden = false;
  buttonText.textContent = 'Signing in...';
  message.textContent = '';
  message.className = '';

  try {
    const response = await fetch(
      '/api/admin-auth?action=login', {
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          password:password.value,
          remember:document.getElementById('remember').checked
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success)
      throw new Error(data.error || 'Unable to sign in.');

    password.value = '';
    password.type = 'password';
    toggle.setAttribute('aria-pressed','false');
    toggle.setAttribute('aria-label','Show password');
    document.getElementById('eyeSlash').hidden = true;

    message.className = 'success';
    message.textContent = 'Authentication successful.';
    location.replace('/admin.html');
  } catch(error) {
    message.textContent = error instanceof SyntaxError
      ? 'Service unavailable. Please try again.'
      : error.message || 'Connection failed.';
  } finally {
    button.disabled = false;
    spinner.hidden = true;
    buttonText.textContent = 'Sign in';
  }
});


fetch('/api/admin-auth?action=session',{
  credentials:'same-origin',
  cache:'no-store'
}).then(response=>{
  if(response.ok) location.replace('/admin.html');
}).catch(()=>{});
