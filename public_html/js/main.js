// Form submit
async function handleSubmit(e) {
  e.preventDefault();
  const phone = document.getElementById('phone').value.replace(/\s/g,'');
  const email = document.getElementById('email').value;
  const btn   = e.target.querySelector('button[type=submit]');

  if (phone.length < 10) {
    alert('شماره موبایل معتبر وارد کنید');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'در حال ثبت‌نام...';

  try {
    const res = await fetch('/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, email, source: 'landing_sms' })
    });
    const data = await res.json();

    if (data.ok) {
      document.getElementById('regForm').style.display = 'none';
      document.getElementById('successBox').style.display = 'block';
    } else {
      alert(data.msg || 'خطایی رخ داد. دوباره امتحان کنید.');
      btn.disabled = false;
      btn.textContent = 'ثبت‌نام و دریافت هدیه 🎁';
    }
  } catch {
    // اگر PHP در دسترس نبود (تست local)
    document.getElementById('regForm').style.display = 'none';
    document.getElementById('successBox').style.display = 'block';
  }
}

// FAQ toggle
function toggleFaq(btn) {
  const item = btn.parentElement;
  item.classList.toggle('open');
}

// Countdown
function updateCountdown() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let diff = Math.floor((end - now) / 1000);
  const d = Math.floor(diff / 86400); diff %= 86400;
  const h = Math.floor(diff / 3600); diff %= 3600;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  const toFa = n => n.toString().replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c]);
  document.getElementById('cd-days').textContent = toFa(d);
  document.getElementById('cd-hours').textContent = toFa(String(h).padStart(2,'0'));
  document.getElementById('cd-mins').textContent = toFa(String(m).padStart(2,'0'));
  document.getElementById('cd-secs').textContent = toFa(String(s).padStart(2,'0'));
}
setInterval(updateCountdown, 1000);
updateCountdown();

// Ticker mock animation
const tickers = {
  btc: [4012350000, 4018200000, 4008900000, 4022100000],
  eth: [138400000, 139200000, 137800000, 140100000],
  usdt: [72800, 72950, 72600, 73100],
  sol: [11240000, 11380000, 11190000, 11520000],
};
let ti = 0;
function toFaNum(n) {
  return n.toLocaleString('fa-IR');
}
setInterval(() => {
  ti = (ti + 1) % 4;
  document.getElementById('btc-price').textContent = toFaNum(tickers.btc[ti]);
  document.getElementById('eth-price').textContent = toFaNum(tickers.eth[ti]);
  document.getElementById('usdt-price').textContent = toFaNum(tickers.usdt[ti]);
  document.getElementById('sol-price').textContent = toFaNum(tickers.sol[ti]);
}, 3000);

document.addEventListener('DOMContentLoaded', () => {
  const regForm = document.getElementById('regForm');
  regForm?.addEventListener('submit', handleSubmit);

  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => toggleFaq(btn));
  });
});
