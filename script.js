(() => {
  const gauge = document.getElementById('gauge');
  const valueEl = document.getElementById('pollution-value');
  const statusEl = document.getElementById('status-text');
  const range = document.getElementById('pollution-range');

  function getColorFor(v){
    if(v < 50) return 'green';
    if(v < 75) return 'orange';
    return 'red';
  }

  function updateGauge(v, animate=true){
    const deg = Math.round(v * 1.8); // map 0..100 -> 0..180 degrees for semicircle
    const color = getColorFor(v);
    // paint semicircle: color from 0..deg and #ddd from deg..180, starting at left (from 180deg)
    gauge.style.background = `conic-gradient(from 180deg, ${color} 0deg ${deg}deg, #ddd ${deg}deg 180deg)`;
    valueEl.textContent = `${v}%`;
    // update status text color and label
    let label = 'Safe';
    let col = 'green';
    if(v < 50){ label='Safe'; col='green' }
    else if(v < 75){ label='Moderate'; col='orange' }
    else { label='High Emission'; col='red' }
      statusEl.innerHTML = `<b style="color:${col}">${label}</b>`;
      // notify other components (e.g., background) about pollution changes
      try{ window.dispatchEvent(new CustomEvent('pollutionChange',{detail:{value:v}})); }catch(e){}
  }

  // initialize from server value
  const initial = Number(window.INIT_POLLUTION || 0);
  if(range){ range.value = initial }
  updateGauge(initial, false);

  // animate when slider changes
  if(range){
    range.addEventListener('input', (e)=>{
      const v = Number(e.target.value);
      updateGauge(v);
    });
  }

  // allow clicking the gauge to pulse animation
  if(gauge){
    gauge.addEventListener('click', ()=>{
      gauge.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.06)' },
        { transform: 'scale(1)' }
      ], { duration: 450, easing: 'ease-out' });
    });
  }

  /* Semicircle knob interaction: drag around the gauge to change value */
  const knob = document.getElementById('gauge-knob');
  function setKnobPosition(v){
    if(!knob || !gauge) return;
    const rect = gauge.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const r = rect.width/2 - 12; // inset
    // angleAng from -90..90 where -90 is left, 0 top, 90 right
    const angleAng = (v / 100) * 180 - 90;
    const angleRad = angleAng * Math.PI/180;
    // compute position: x = cx + r*sin(angle), y = cy - r*cos(angle)
    const x = cx + r * Math.sin(angleRad);
    const y = cy - r * Math.cos(angleRad);
    // position relative to gauge
    knob.style.left = (x - rect.left) + 'px';
    knob.style.top = (y - rect.top) + 'px';
  }

  function valueFromPointer(clientX, clientY){
    const rect = gauge.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // angleDeg from -180..180 where 0 is right; shift so 0 is top
    let angleDeg = Math.atan2(dy, dx) * 180/Math.PI;
    let angleFromTop = angleDeg + 90;
    if(angleFromTop > 180) angleFromTop -= 360;
    // clamp to semicircle range
    if(angleFromTop < -90) angleFromTop = -90;
    if(angleFromTop > 90) angleFromTop = 90;
    const value = Math.round((angleFromTop + 90) / 180 * 100);
    return value;
  }

  if(knob && gauge){
    let dragging = false;
    knob.addEventListener('pointerdown', (e)=>{ e.preventDefault(); dragging=true; knob.setPointerCapture(e.pointerId); const v = valueFromPointer(e.clientX,e.clientY); if(range) range.value = v; updateGauge(v); setKnobPosition(v); });
    document.addEventListener('pointermove', (e)=>{ if(!dragging) return; const v = valueFromPointer(e.clientX,e.clientY); if(range) range.value = v; updateGauge(v); setKnobPosition(v); });
    document.addEventListener('pointerup', (e)=>{ if(!dragging) return; dragging=false; try{ knob.releasePointerCapture(e.pointerId);}catch(e){} });
    // position knob on init after layout
    window.addEventListener('load', ()=>{ setTimeout(()=> setKnobPosition(initial), 10); });
    // also update knob when programmatically changing value
    if(range){ range.addEventListener('input', (e)=> setKnobPosition(Number(e.target.value))); }
  }

  // logout button triggers link click
  const logoutBtn = document.getElementById('logout');
  const logoutLink = document.getElementById('logout-link');
  if(logoutBtn && logoutLink){
    logoutBtn.addEventListener('click', ()=> logoutLink.click());
  }

})();

// Dashboard interactive gradient background
(function(){
  if(!document.body.classList.contains('dashboard')) return;
  const body = document.body;

  const baseSets = {
    green: ['#eef6ff','#f4f7fb'],
    orange: ['#fff7ed','#fffaf0'],
    red: ['#fff1f2','#fff5f5']
  };

  function severityFor(v){ if(v < 50) return 'green'; if(v < 75) return 'orange'; return 'red'; }

  function setBaseColorsForSeverity(s){
    const [top,bottom] = baseSets[s] || baseSets.green;
    body.dataset.baseTop = top;
    body.dataset.baseBottom = bottom;
    // set CSS vars immediately
    body.style.setProperty('--bg-top', top);
    body.style.setProperty('--bg-bottom', bottom);
  }

  // color helpers
  function hexToRgb(hex){
    hex = hex.replace('#','');
    if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const n = parseInt(hex,16); return [ (n>>16)&255, (n>>8)&255, n&255 ];
  }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(x=>{const s=x.toString(16);return s.length===1?('0'+s):s}).join(''); }
  function mixColors(a,b,t){ const A=hexToRgb(a), B=hexToRgb(b); const R = Math.round(A[0] + (B[0]-A[0])*t); const G = Math.round(A[1] + (B[1]-A[1])*t); const Bl = Math.round(A[2] + (B[2]-A[2])*t); return rgbToHex(R,G,Bl); }

  // pointer-driven subtle update using requestAnimationFrame throttle
  let rafPending = false;
  function onPointerMove(e){ if(rafPending) return; rafPending = true; window.requestAnimationFrame(()=>{
    rafPending = false;
    const t = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
    const baseTop = body.dataset.baseTop || getComputedStyle(body).getPropertyValue('--bg-top').trim();
    const baseBottom = body.dataset.baseBottom || getComputedStyle(body).getPropertyValue('--bg-bottom').trim();
    // top brightens as pointer goes up (mix with white), bottom darkens slightly as pointer goes down (mix with a soft shade)
    const top = mixColors(baseTop, '#ffffff', (1 - t) * 0.22);
    const bottom = mixColors(baseBottom, '#e6eef7', t * 0.12);
    body.style.setProperty('--bg-top', top);
    body.style.setProperty('--bg-bottom', bottom);
  }); }

  // update base when pollution changes
  function onPollution(e){ const v = Number(e.detail && e.detail.value || 0); setBaseColorsForSeverity(severityFor(v)); }

  // initialize
  const initVal = Number(window.INIT_POLLUTION || 0);
  setBaseColorsForSeverity(severityFor(initVal));

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pollutionChange', onPollution);
  // also respond when page regains focus to reapply base colors
  window.addEventListener('focus', ()=> setBaseColorsForSeverity(severityFor(Number(window.INIT_POLLUTION || 0))));
})();

// Auth page interactivity: password toggles and client-side validation
(function(){
  function togglePassword(btnId, inputId){
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if(!btn || !input) return;
    btn.addEventListener('click', ()=>{
      if(input.type === 'password'){
        input.type = 'text'; btn.textContent = 'Hide';
      } else { input.type = 'password'; btn.textContent = 'Show'; }
    });
  }

  togglePassword('toggle-password','password');
  togglePassword('su-toggle-password','su-password');

  function attachFormValidation(formId, errorId, usernameId, passwordId){
    const form = document.getElementById(formId);
    if(!form) return;
    const err = document.getElementById(errorId);
    form.addEventListener('submit', (ev)=>{
      const uname = usernameId ? document.getElementById(usernameId).value.trim() : '';
      const pwd = passwordId ? document.getElementById(passwordId).value : '';
      let msg = '';
      if(!uname || uname.length < 3) msg = 'Username must be at least 3 characters.';
      else if(!pwd || pwd.length < 4) msg = 'Password must be at least 4 characters.';
      if(msg){
        ev.preventDefault();
        if(err){ err.style.display='block'; err.textContent = msg; }
      }
    });
  }

  attachFormValidation('login-form','form-error','username','password');
  attachFormValidation('signup-form','su-error','su-username','su-password');
  // Additional client-side validation for signup: require vehicle fields
  const suForm = document.getElementById('signup-form');
  if(suForm){
    suForm.addEventListener('submit', (ev)=>{
      const vnum = document.getElementById('su-vehicle-number').value.trim();
      const vmod = document.getElementById('su-vehicle-model').value.trim();
      const serverErr = document.getElementById('server-su-error');
      if(!vnum || !vmod){
        ev.preventDefault();
        if(serverErr){ serverErr.style.display='block'; serverErr.textContent='Vehicle number and model are required'; }
      }
    });
  }

  // Client-side validation for profile edit
  const profileForm = document.getElementById('profile-form');
  if(profileForm){
    profileForm.addEventListener('submit', (ev)=>{
      const vnum = document.querySelector('#profile-form input[name="vehicle_number"]').value.trim();
      const vmod = document.querySelector('#profile-form input[name="vehicle_model"]').value.trim();
      const perr = document.getElementById('profile-error');
      if(!vnum || !vmod){
        ev.preventDefault();
        if(perr){ perr.style.display='block'; perr.textContent='Vehicle number and model are required'; }
      }
    });
  }
})();

// Profile dropdown toggle (top-right)
(function(){
  const profileEl = document.querySelector('.profile.top-right');
  if(!profileEl) return;
  const dropdown = profileEl.querySelector('.dropdown');
  function setOpen(open){
    profileEl.classList.toggle('open', open);
    profileEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // Toggle on click of the profile container (ignore clicks on dropdown links)
  profileEl.addEventListener('click', (e)=>{
    const link = e.target.closest('.dropdown a');
    if(link) return; // allow navigation
    e.preventDefault();
    setOpen(!profileEl.classList.contains('open'));
  });

  // Close when clicking outside
  document.addEventListener('click', (e)=>{
    if(!profileEl.contains(e.target)) setOpen(false);
  });

  // Close on Escape
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') setOpen(false); });
})();
