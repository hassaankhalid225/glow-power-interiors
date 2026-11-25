/* Glow Power — shared light state, scroll story, page transitions and small interactions.
   Loaded before scene.js; everything here also works when WebGL is unavailable. */
(function(){
  'use strict';
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var PALS = {amber:1, rose:1, lilac:1};
  var subs = [];
  var stored = root.getAttribute('data-palette');

  /* ---------- shared light state (palette + lights) ---------- */
  var GP = window.GP = {
    reduce: reduce,
    palette: PALS[stored] ? stored : 'amber',
    lights: true,
    story: {S:0},
    on: function(fn){ subs.push(fn); },
    emit: function(type){ for (var i=0;i<subs.length;i++){ try { subs[i](type, GP); } catch (e) {} } },
    setPalette: function(name){
      if (!PALS[name]) return;
      GP.palette = name;
      root.setAttribute('data-palette', name);
      try { localStorage.setItem('gp-palette', name); } catch (e) {}
      sync(); GP.emit('palette');
    },
    setLights: function(on){ GP.lights = !!on; root.classList.toggle('lights-off', !GP.lights); sync(); GP.emit('lights'); }
  };
  function sync(){
    document.querySelectorAll('[data-palette]').forEach(function(b){ if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.getAttribute('data-palette') === GP.palette)); });
    document.querySelectorAll('[data-lights]').forEach(function(b){
      b.setAttribute('aria-pressed', String(!GP.lights));
      var label = b.querySelector('[data-lights-label]') || b;
      label.textContent = GP.lights ? 'Switch lights off' : 'Switch lights on';
    });
  }
  function bindControls(){
    document.querySelectorAll('button[data-palette]').forEach(function(b){
      b.addEventListener('click', function(){ GP.setPalette(b.getAttribute('data-palette')); });
    });
    document.querySelectorAll('[data-lights]').forEach(function(b){
      b.addEventListener('click', function(){ GP.setLights(!GP.lights); });
    });
    sync();
  }

  /* ---------- home scroll story ---------- */
  function initStory(){
    var story = document.querySelector('[data-story]');
    if (!story) return;
    var panels = [].slice.call(story.querySelectorAll('[data-panel]'));
    var rail = story.querySelector('[data-rail]');
    var ticks = rail ? [].slice.call(rail.querySelectorAll('li')) : [];
    var queued = false, lastActive = -1;
    function measure(){
      queued = false;
      var tops = panels.map(function(p){ return p.getBoundingClientRect().top; });
      var S = 0;
      for (var i=0;i<panels.length;i++){
        if (tops[i] <= 0){
          var next = i+1 < panels.length ? tops[i+1] : tops[i] + panels[i].offsetHeight;
          S = i + Math.min(1, -tops[i] / Math.max(1, next - tops[i]));
        }
      }
      S = Math.min(S, panels.length - 1);
      GP.story.S = S;
      var active = Math.round(S);
      if (active !== lastActive){
        lastActive = active;
        panels.forEach(function(p, k){ p.classList.toggle('is-active', k === active); });
        story.setAttribute('data-step', String(active));
      }
      if (rail){
        var prog = Math.max(0, Math.min(1, (S - 1.5) / 4));
        rail.style.setProperty('--prog', prog.toFixed(4));
        rail.classList.toggle('is-on', S > 1.4 && S < panels.length - .45);
        ticks.forEach(function(t, k){ t.classList.toggle('is-active', Math.round(S) - 2 === k); t.classList.toggle('is-done', S - 2 > k + .4); });
      }
    }
    function queue(){ if (!queued){ queued = true; requestAnimationFrame(measure); } }
    window.addEventListener('scroll', queue, {passive:true});
    window.addEventListener('resize', queue);
    measure();
  }

  /* ---------- page transitions: the lights dim, then the next page brightens ---------- */
  function initTransitions(){
    if (reduce) return;
    var veil = document.createElement('div');
    veil.className = 'veil'; veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(veil);
    document.addEventListener('click', function(e){
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(tel:|mailto:|https?:|\/\/|javascript:)/i.test(href)) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      root.classList.add('is-leaving');
      setTimeout(function(){ location.href = a.href; }, 340);
    });
    window.addEventListener('pageshow', function(ev){ if (ev.persisted) root.classList.remove('is-leaving'); });
  }

  /* ---------- light-edge hovers follow the pointer ---------- */
  function initEdges(){
    document.addEventListener('pointermove', function(e){
      var el = e.target.closest && e.target.closest('.edge');
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, {passive:true});
  }

  /* ---------- isometric rooms: per-card light colour + lights on in view for touch ---------- */
  function initRooms(){
    document.querySelectorAll('[data-room-color]').forEach(function(b){
      b.addEventListener('click', function(){
        var card = b.closest('[data-room]');
        if (!card) return;
        card.style.setProperty('--c', b.getAttribute('data-room-color'));
        card.classList.add('is-lit');
        card.querySelectorAll('[data-room-color]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    var coarse = window.matchMedia && matchMedia('(hover: none)').matches;
    if (!coarse || !window.IntersectionObserver) return;
    var io = new IntersectionObserver(function(en){
      en.forEach(function(x){ x.target.classList.toggle('in-view', x.isIntersecting); });
    }, {threshold:.55});
    document.querySelectorAll('[data-room]').forEach(function(c){ io.observe(c); });
  }

  /* ---------- reveal sections once (one quiet rise, not on every element) ---------- */
  function initReveal(){
    var els = document.querySelectorAll('[data-reveal]');
    if (reduce || !window.IntersectionObserver){ els.forEach(function(el){ el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function(en){
      en.forEach(function(x){ if (x.isIntersecting){ x.target.classList.add('is-in'); io.unobserve(x.target); } });
    }, {threshold:.15, rootMargin:'0px 0px -6% 0px'});
    els.forEach(function(el){ io.observe(el); });
  }

  function boot(){
    bindControls(); initStory(); initTransitions(); initEdges(); initRooms(); initReveal();
    root.classList.add('ui-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
