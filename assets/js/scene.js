/* Glow Power — an office interior whose lighting switches on */
(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PALETTES = { amber:0xFFB547, rose:0xFF5FA2, lilac:0xCBB8FF };

  function build(canvas){
    var mini = canvas.getAttribute('data-scene') === 'mini';
    var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x160E22);
    scene.fog = new THREE.Fog(0x160E22, 22, 46);
    var camera = new THREE.PerspectiveCamera(40, 1, .1, 120);

    scene.add(new THREE.AmbientLight(0x6A4F8F, .35));
    function M(c,r,m){ return new THREE.MeshStandardMaterial({color:c, roughness:r==null?.7:r, metalness:m||0}); }
    function box(w,h,d,x,y,z,m){ var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); b.position.set(x,y,z); scene.add(b); return b; }

    var W = 16, D = 14, H = 6;
    var floorM = M(0x2A1A3D,.35,.2), wallM = M(0x3A2850,.9), wallM2 = M(0x2F2042,.9);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W,D), floorM); floor.rotation.x = -Math.PI/2; scene.add(floor);
    var back = new THREE.Mesh(new THREE.PlaneGeometry(W,H), wallM); back.position.set(0,H/2,-D/2); scene.add(back);
    var left = new THREE.Mesh(new THREE.PlaneGeometry(D,H), wallM2); left.rotation.y = Math.PI/2; left.position.set(-W/2,H/2,0); scene.add(left);
    // ceiling band (bulkhead) along back and left walls
    box(W,.6,2.2, 0,H-.3,-D/2+1.1, M(0x241632,.8));
    box(2.2,.6,D, -W/2+1.1,H-.3,0, M(0x241632,.8));

    var glowMats = [], strips = [];
    function glowMat(){ var m = new THREE.MeshStandardMaterial({color:0x111111, emissive:0xFFB547, emissiveIntensity:0, roughness:1}); glowMats.push(m); return m; }
    function strip(w,h,d,x,y,z,delay){ var s = box(w,h,d,x,y,z,glowMat()); strips.push({m:s.material, delay:delay}); return s; }

    // cove light lines under bulkheads
    strip(W-2.4,.06,.08, 1.2,H-.62,-D/2+2.2, .2);
    strip(.08,.06,D-2.4, -W/2+2.2,H-.62,1.2, .5);
    // wall slats with backlight on back wall
    var slatM = M(0x8A6A4A,.55);
    for (var i=0;i<14;i++) box(.18,4.2,.12, -1+i*.42,2.4,-D/2+.12, slatM);
    strip(6,.05,.05, 1.7,.25,-D/2+.06, .8);
    strip(6,.05,.05, 1.7,4.55,-D/2+.06, .9);
    // reception desk with glowing kick
    var deskM = M(0xF4EEFF,.35);
    box(5.2,1.1,1.4, -1.5,.65,-1, deskM);
    box(5.6,.08,1.7, -1.5,1.24,-1, M(0x1C1228,.3,.4));
    strip(5,.05,.05, -1.5,.08,-.28, 1.2);
    // shelving on left wall with lit niches
    var shelfM = M(0x1C1228,.6);
    for (var r=0;r<3;r++){
      for (var c=0;c<3;c++){
        var y = 1.1 + r*1.3, z = -4.2 + c*1.9;
        box(.5,.08,1.7, -W/2+.3,y-.55,z, shelfM);
        strip(.04,1,1.5, -W/2+.03,y,z, 1.5 + r*.25 + c*.12);
      }
    }
    // pendant lights
    var pendants = [];
    for (var p=0;p<3;p++){
      var px = -3+p*1.5;
      var cord = box(.02,1.8,.02, px,H-.9,-1, M(0x111111));
      var shade = new THREE.Mesh(new THREE.SphereGeometry(.28,24,16), glowMat()); shade.position.set(px,H-2,-1); scene.add(shade);
      strips.push({m:shade.material, delay:2.2+p*.2});
      var pl = new THREE.PointLight(0xFFB547, 0, 7, 2); pl.position.set(px,H-2.3,-1); scene.add(pl);
      pendants.push(pl);
    }
    // lounge: sofa + table + plant
    var sofaM = M(0xCBB8FF,.9);
    box(3.6,.5,1.3, 3.6,.45,3, sofaM); box(3.6,.9,.35, 3.6,.95,3.6, sofaM);
    box(.35,.8,1.3, 1.95,.6,3, sofaM); box(.35,.8,1.3, 5.25,.6,3, sofaM);
    var table = new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.08,40), M(0xF4EEFF,.25)); table.position.set(3.6,.55,1.4); scene.add(table);
    box(.12,.5,.12, 3.6,.28,1.4, M(0x111111));
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(.35,.28,.7,20), M(0xF4EEFF,.5)); pot.position.set(6.6,.35,-5.6); scene.add(pot);
    var leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(.9,0), M(0x3E6B52,.8)); leaf.position.set(6.6,1.5,-5.6); leaf.scale.y = 1.4; scene.add(leaf);
    // glass partition
    var glass = new THREE.Mesh(new THREE.BoxGeometry(.06,3.6,5), new THREE.MeshStandardMaterial({color:0xCBB8FF, transparent:true, opacity:.14, roughness:.05, metalness:.6}));
    glass.position.set(.6,1.8,4.2); scene.add(glass);
    box(.08,.08,5, .6,3.62,4.2, M(0x111111)); box(.08,.08,5, .6,.04,4.2, M(0x111111));

    // fill lights for the strips
    var fills = [new THREE.PointLight(0xFFB547,0,12,2), new THREE.PointLight(0xFFB547,0,12,2), new THREE.PointLight(0xFFB547,0,10,2)];
    fills[0].position.set(1,H-1,-D/2+2); fills[1].position.set(-W/2+2,H-1,1); fills[2].position.set(1.7,2.4,-D/2+1);
    fills.forEach(function(f){ scene.add(f); });
    // cursor torch
    var torch = new THREE.PointLight(0xF4EEFF, mini ? 0 : .9, 9, 2); torch.position.set(2,2.5,2); scene.add(torch);

    // dust
    var n = 400, arr = new Float32Array(n*3);
    for (var k=0;k<n;k++){ arr[k*3]=(Math.random()-.5)*W; arr[k*3+1]=Math.random()*H; arr[k*3+2]=(Math.random()-.5)*D; }
    var dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(arr,3));
    var dust = new THREE.Points(dg, new THREE.PointsMaterial({color:0xFFE3C2, size:.04, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false}));
    scene.add(dust);

    // palette switching
    var current = new THREE.Color(PALETTES.amber), target = current.clone();
    function setPalette(name){ if (PALETTES[name]) target.setHex(PALETTES[name]); }
    document.querySelectorAll('[data-palette]').forEach(function(b){
      b.addEventListener('click', function(){
        setPalette(b.getAttribute('data-palette'));
        document.querySelectorAll('[data-palette]').forEach(function(x){ x.setAttribute('aria-pressed', String(x===b)); });
      });
    });
    var switchBtn = document.querySelector('[data-lights]');
    var lightsOn = true;
    if (switchBtn) switchBtn.addEventListener('click', function(){
      lightsOn = !lightsOn; switchBtn.setAttribute('aria-pressed', String(!lightsOn));
      switchBtn.textContent = lightsOn ? 'Switch lights off' : 'Switch lights on';
    });

    // cursor -> floor
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0), -1.2), hit = new THREE.Vector3();
    var mx = 0, my = 0;
    window.addEventListener('pointermove', function(e){
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX-r.left)/r.width)*2-1; mouse.y = -((e.clientY-r.top)/r.height)*2+1;
      mx = e.clientX/window.innerWidth-.5; my = e.clientY/window.innerHeight-.5;
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(plane, hit)) { hit.x = Math.max(-7,Math.min(7,hit.x)); hit.z = Math.max(-6,Math.min(6,hit.z)); }
    }, {passive:true});

    function size(){
      var w = canvas.clientWidth||1, h = canvas.clientHeight||1;
      renderer.setSize(w,h,false); camera.aspect = w/h; camera.fov = w < 700 ? 58 : 40;
      if (w > 900 && !mini) camera.setViewOffset(w,h,w*.2,0,w,h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);

    var t0 = performance.now(), level = 0;
    function frame(now){
      requestAnimationFrame(frame);
      if (!visible) return;
      var t = (now-t0)/1000;
      current.lerp(target, .06);
      level += ((lightsOn?1:0) - level) * .08;
      strips.forEach(function(s){
        var on = (reduce||mini) ? 1 : Math.min(Math.max((t - .6 - s.delay)/.35, 0), 1);
        var flick = on > 0 && on < 1 ? (Math.random() > .5 ? 1 : .3) : 1;
        s.m.emissive.copy(current);
        s.m.emissiveIntensity = on*flick*2.2*level;
      });
      var allOn = (reduce||mini) ? 1 : Math.min(Math.max((t-1.4)/1.6,0),1);
      fills.forEach(function(f){ f.color.copy(current); f.intensity = allOn*1.6*level; });
      pendants.forEach(function(pl){ pl.color.copy(current); pl.intensity = allOn*1.2*level; });
      if (!mini) torch.position.lerp(new THREE.Vector3(hit.x||2, 2.4, hit.z||2), .08);
      if (!reduce) dust.rotation.y = t*.01;
      var cx = 13.5 + mx*1.5, cy = 7.6 - my*1.2;
      camera.position.set(cx, cy, 15.5 + mx*.8);
      camera.lookAt(-.6, 1.9, -.8);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  function boot(){
    document.querySelectorAll('canvas[data-scene]').forEach(function(c){
      try { if (!window.THREE) throw new Error('three missing'); build(c); }
      catch (err) { c.parentElement.classList.add('no-webgl'); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
