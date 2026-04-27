/* ==========================================================================
   CHRSTPHR — global.js
   Shared utilities used on every page:
     - Clock in the top-bar
     - Custom cursor follow + label hover behavior
     - Sound state (persistent across pages) + one-shot beep helper
     - Footer year auto-fill
   Page-specific JS stays inline in each .html file.
   ========================================================================== */
(function () {
  'use strict';

  /* ----- CLOCK ---------------------------------------------------------- */
  function tickClock() {
    var el = document.getElementById('clock');
    if (!el) return;
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ----- CUSTOM CURSOR -------------------------------------------------- */
  var cursor = document.getElementById('cursor');
  var label  = document.getElementById('cursor-label');
  if (cursor) {
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var tx = cx, ty = cy;
    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (label) {
        label.style.left = tx + 'px';
        label.style.top  = ty + 'px';
      }
    });
    (function loop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.left = cx + 'px';
      cursor.style.top  = cy + 'px';
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mousedown', function () { cursor.classList.add('click'); });
    document.addEventListener('mouseup',   function () { cursor.classList.remove('click'); });

    // Generic hover-reactive elements: any [data-cursor-label] shows the label
    document.querySelectorAll('[data-cursor-label]').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        cursor.classList.add('big');
        if (label) {
          label.textContent = el.getAttribute('data-cursor-label') || '';
          label.classList.add('show');
        }
      });
      el.addEventListener('mouseleave', function () {
        cursor.classList.remove('big');
        if (label) label.classList.remove('show');
      });
    });
  }

  /* ----- SOUND ---------------------------------------------------------- */
  // Persisted across pages via localStorage. Default = ON.
  var STORAGE_KEY = 'chrstphr.sound';
  var stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  var soundOn = stored === null ? true : (stored === 'on');
  var audioCtx = null;

  function ensureCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function paintToggle() {
    var btn = document.getElementById('sound-toggle');
    if (!btn) return;
    btn.classList.toggle('off', !soundOn);
    var label = btn.querySelector('.label');
    if (label) label.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  }

  function setSound(on) {
    soundOn = !!on;
    try { localStorage.setItem(STORAGE_KEY, soundOn ? 'on' : 'off'); } catch (e) {}
    paintToggle();
    if (soundOn) ensureCtx();
  }

  // Expose a small global API for page-specific scripts.
  window.CHRSTPHR = window.CHRSTPHR || {};
  window.CHRSTPHR.isSoundOn = function () { return soundOn; };
  window.CHRSTPHR.setSound  = setSound;
  window.CHRSTPHR.beep = function (freq, dur, type) {
    if (!soundOn || !audioCtx) return;
    try {
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq || 440;
      g.gain.setValueAtTime(0.04, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + (dur || 0.08));
    } catch (e) {}
  };

  // Wire up the toggle button if present
  document.addEventListener('DOMContentLoaded', function () {
    paintToggle();
    var btn = document.getElementById('sound-toggle');
    if (btn) {
      btn.addEventListener('click', function () { setSound(!soundOn); });
    }
    // First-click-anywhere unlocks the audio context (once)
    var unlock = function () {
      ensureCtx();
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);

    // Auto-fill any element marked with [data-year]
    var yr = new Date().getFullYear();
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = yr;
    });
  });
})();
