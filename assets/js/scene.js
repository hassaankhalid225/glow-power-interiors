/* Glow Power — the fit-out, in 3D.
   One builder drives the home hero (scroll story: shell -> plan -> build -> furniture -> lights)
   and the smaller scenes in the inner page headers. Three.js r128, no add-ons. */
(function(){
  'use strict';
  var GP = window.GP || {palette:'amber', lights:true, story:{S:0}, on:function(){}};
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var PAL = {amber:0xFFB547, rose:0xFF5FA2, lilac:0xCBB8FF};
  var NIGHT = 0x160E22;

  function sat(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t){ t = sat(t); return t*t*(3-2*t); }
  function outCubic(t){ t = sat(t); return 1 - Math.pow(1-t, 3); }
  function outBack(t){ t = sat(t); var c = 1.5; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function damp(dt, k){ return 1 - Math.exp(-dt*k); }
  // seeded random so the room looks the same on every visit
  var seed = 7;
  function rnd(){ seed = (seed*16807) % 2147483647; return (seed-1)/2147483646; }

  /* ---------- canvas textures ---------- */
  function canvasTex(w,h,draw){ var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new THREE.CanvasTexture(c); return t; }
  function texRadial(){
    return canvasTex(128,128,function(x){
      var g = x.createRadialGradient(64,64,0,64,64,64);
      g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.3,'rgba(255,255,255,.5)');
      g.addColorStop(.65,'rgba(255,255,255,.12)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0,0,128,128);
    });
  }
  function texWash(){
    return canvasTex(64,128,function(x,w,h){
      var g = x.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.18,'rgba(255,255,255,.55)');
      g.addColorStop(.55,'rgba(255,255,255,.12)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0,0,w,h);
      var e = x.createLinearGradient(0,0,w,0); // soft side edges
      e.addColorStop(0,'rgba(0,0,0,1)'); e.addColorStop(.12,'rgba(0,0,0,0)'); e.addColorStop(.88,'rgba(0,0,0,0)'); e.addColorStop(1,'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = e; x.fillRect(0,0,w,h);
    });
  }
  function texFloor(n){
    var t = canvasTex(n,n,function(x,w,h){
      x.fillStyle = '#cfc8da'; x.fillRect(0,0,w,h);
      for (var i=0;i<w*h/90;i++){ var v = 150 + rnd()*105|0; x.fillStyle = 'rgba('+v+','+v+','+(v+8)+','+(.25+rnd()*.3)+')'; x.fillRect(rnd()*w, rnd()*h, 1+rnd()*1.6, 1+rnd()*1.6); }
      x.strokeStyle = 'rgba(70,55,95,.55)'; x.lineWidth = Math.max(1, w/700);
      for (var k=1;k<6;k++){ x.beginPath(); x.moveTo(k*w/6,0); x.lineTo(k*w/6,h); x.stroke(); }
      for (var j=1;j<5;j++){ var yy = j*3/14*h; x.beginPath(); x.moveTo(0,yy); x.lineTo(w,yy); x.stroke(); }
    });
    t.encoding = THREE.sRGBEncoding; return t;
  }
  function texCity(){
    var t = canvasTex(512,256,function(x,w,h){
      var g = x.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#120a22'); g.addColorStop(.62,'#2c1846'); g.addColorStop(.86,'#57305e'); g.addColorStop(1,'#2a1838');
      x.fillStyle = g; x.fillRect(0,0,w,h);
      for (var s=0;s<70;s++){ x.fillStyle = 'rgba(255,240,255,'+(.2+rnd()*.5)+')'; x.fillRect(rnd()*w, rnd()*h*.45, 1, 1); }
      var bx = 0;
      while (bx < w){
        var bw = 18 + rnd()*44, bh = 50 + rnd()*150, tall = rnd() > .9;
        if (tall) bh += 50;
        x.fillStyle = rnd() > .5 ? '#140b21' : '#1a0f2a'; x.fillRect(bx, h-bh, bw, bh);
        if (tall){ x.beginPath(); x.moveTo(bx+bw*.35,h-bh); x.lineTo(bx+bw*.5,h-bh-60); x.lineTo(bx+bw*.65,h-bh); x.fill(); }
        for (var wy=h-bh+6; wy<h-4; wy+=7) for (var wx=bx+4; wx<bx+bw-4; wx+=6)
          if (rnd() < .22){ x.fillStyle = rnd() > .3 ? 'rgba(255,200,130,.85)' : 'rgba(210,190,255,.8)'; x.fillRect(wx,wy,3,3.5); }
        bx += bw + 2 + rnd()*6;
      }
    });
    t.encoding = THREE.sRGBEncoding; return t;
  }
  function texLabel(text){
    return canvasTex(256,64,function(x,w,h){
      x.font = '600 30px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
      x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w/2, h/2);
    });
  }

  /* ---------- post-processing: hand-written bloom + vignette + grain ---------- */
  var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  function Post(renderer){
    var gl2 = renderer.capabilities.isWebGL2;
    var opts = {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, depthBuffer:false, stencilBuffer:false};
    var main = gl2 ? new THREE.WebGLMultisampleRenderTarget(4,4,{format:THREE.RGBAFormat}) : new THREE.WebGLRenderTarget(4,4,{format:THREE.RGBAFormat});
    if (gl2) main.samples = 4;
    var a = new THREE.WebGLRenderTarget(4,4,opts), b = a.clone(), c = a.clone(), d = a.clone();
    var cam = new THREE.OrthographicCamera(-1,1,1,-1,0,1), qs = new THREE.Scene();
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2)); quad.frustumCulled = false; qs.add(quad);
    function mat(fs, u){ return new THREE.ShaderMaterial({uniforms:u, vertexShader:VS, fragmentShader:fs, depthTest:false, depthWrite:false}); }
    var bright = mat([
      'uniform sampler2D t; uniform vec2 px; uniform float th; varying vec2 vUv;',
      'void main(){ vec3 s = texture2D(t, vUv + px*vec2(-1.,-1.)).rgb + texture2D(t, vUv + px*vec2(1.,-1.)).rgb + texture2D(t, vUv + px*vec2(-1.,1.)).rgb + texture2D(t, vUv + px*vec2(1.,1.)).rgb;',
      's *= .25; float l = max(s.r, max(s.g, s.b)); gl_FragColor = vec4(s * smoothstep(th, th + .3, l), 1.); }'
    ].join('\n'), {t:{value:null}, px:{value:new THREE.Vector2()}, th:{value:.72}});
    var blur = mat([
      'uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;',
      'void main(){ vec3 c = texture2D(t, vUv).rgb * .2270270;',
      'c += (texture2D(t, vUv + dir*1.3846153).rgb + texture2D(t, vUv - dir*1.3846153).rgb) * .3162162;',
      'c += (texture2D(t, vUv + dir*3.2307692).rgb + texture2D(t, vUv - dir*3.2307692).rgb) * .0702702;',
      'gl_FragColor = vec4(c, 1.); }'
    ].join('\n'), {t:{value:null}, dir:{value:new THREE.Vector2()}});
    var comp = mat([
      'uniform sampler2D ts; uniform sampler2D b1; uniform sampler2D b2; uniform float k; uniform float time; uniform vec2 res; varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){ vec3 c = texture2D(ts, vUv).rgb;',
      'vec3 bl = texture2D(b1, vUv).rgb * .9 + texture2D(b2, vUv).rgb * .6;',
      'c += bl * k;',
      'vec2 q = vUv - .5; q.x *= res.x / res.y; float v = smoothstep(1.15, .25, length(q)); c *= mix(.55, 1., v);',
      'c = pow(max(c, 0.), vec3(1./2.2));',
      'c += (hash(vUv * res + time) - .5) * .028;',
      'gl_FragColor = vec4(c, 1.); }'
    ].join('\n'), {ts:{value:null}, b1:{value:null}, b2:{value:null}, k:{value:1}, time:{value:0}, res:{value:new THREE.Vector2(1,1)}});
    function pass(m, target){ quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, cam); }
    return {
      setSize: function(w,h){
        main.setSize(w,h);
        var w4 = Math.max(2, w/4|0), h4 = Math.max(2, h/4|0), w8 = Math.max(2, w/8|0), h8 = Math.max(2, h/8|0);
        a.setSize(w4,h4); b.setSize(w4,h4); c.setSize(w8,h8); d.setSize(w8,h8);
        comp.uniforms.res.value.set(w,h);
        this.w = w; this.h = h; this.w4 = w4; this.h4 = h4; this.w8 = w8; this.h8 = h8;
      },
      render: function(scene, camera, strength, time){
        renderer.setRenderTarget(main); renderer.render(scene, camera);
        bright.uniforms.t.value = main.texture; bright.uniforms.px.value.set(1/this.w, 1/this.h); pass(bright, a);
        blur.uniforms.t.value = a.texture; blur.uniforms.dir.value.set(1/this.w4, 0); pass(blur, b);
        blur.uniforms.t.value = b.texture; blur.uniforms.dir.value.set(0, 1/this.h4); pass(blur, a);
        blur.uniforms.t.value = a.texture; blur.uniforms.dir.value.set(1.6/this.w8, 0); pass(blur, c);
        blur.uniforms.t.value = c.texture; blur.uniforms.dir.value.set(0, 1.6/this.h8); pass(blur, d);
        comp.uniforms.ts.value = main.texture; comp.uniforms.b1.value = a.texture; comp.uniforms.b2.value = d.texture;
        comp.uniforms.k.value = strength; comp.uniforms.time.value = time % 100;
        pass(comp, null);
      }
    };
  }

  /* ---------- camera views ---------- */
  var V = {
    hero:     {p:[22,13.8,24.5],   t:[-.6,.2,-.6], f:30},
    shell:    {p:[17,21,21],       t:[-.3,0,-.3],  f:33},
    survey:   {p:[.4,36,10],       t:[0,0,0],      f:35},
    design:   {p:[5,27,23],        t:[.4,0,.6],    f:34},
    build:    {p:[17,11,17],       t:[-1.2,1.0,-1.2], f:35},
    light:    {p:[12.5,4.8,13.5],  t:[-2,1.4,-2.4], f:40},
    handover: {p:[23,10.5,20],     t:[-.6,.4,-.6], f:31},
    reception:{p:[7.4,2.7,2.6],    t:[3.4,1.7,-5.8], f:50},
    workspace:{p:[4.5,6.2,10.5],   t:[-5,.8,2.2],  f:40},
    meeting:  {p:[.8,3.6,3.2],     t:[-6,1.3,-4.6], f:44},
    lounge:   {p:[6.2,4.2,11.5],   t:[4.2,1.0,1.8], f:40},
    lost:     {p:[19,8.5,19],      t:[-1,.6,-1], f:34}
  };
  // home scroll story: one key per panel (hero, rewind, survey, design, build, light, handover)
  var KEYS = [
    {v:'hero', B:4, P:0}, {v:'shell', B:0, P:0}, {v:'survey', B:0, P:.45}, {v:'design', B:0, P:1},
    {v:'build', B:2, P:1}, {v:'light', B:4, P:0}, {v:'handover', B:4, P:0}
  ];

  function build(canvas){
    var hero = canvas.getAttribute('data-scene') === 'hero';
    var view = canvas.getAttribute('data-view') || 'hero';
    var lost = view === 'lost';
    var small = Math.min(window.innerWidth, (screen && screen.width) || 9999) < 760;
    var HQ = !small;
    var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:!HQ, powerPreference:'high-performance'});
    var usePost = HQ && renderer.capabilities.isWebGL2;
    if (!usePost && HQ) renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(NIGHT, 1);
    if (HQ){ renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    var post = usePost ? Post(renderer) : null;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT);
    scene.fog = new THREE.Fog(NIGHT, 30, 62);
    var camera = new THREE.PerspectiveCamera(34, 1, .1, 140);
    var root = new THREE.Group(); scene.add(root);
    var mirrorGroup = new THREE.Group(); scene.add(mirrorGroup);

    var W = 18, D = 14, H = 4, X0 = -W/2, Z0 = -D/2;
    var RAD = texRadial(), WASH = texWash();

    /* materials */
    function M(c,r,m,extra){ var o = {color:c, roughness:r==null?.8:r, metalness:m||0}; if (extra) for (var k in extra) o[k] = extra[k]; return new THREE.MeshStandardMaterial(o); }
    var mWall = M(0x3b2a52,.95), mWall2 = M(0x33244a,.95), mCap = M(0x6d5a8e,.8), mSkirt = M(0x1b1128,.7);
    var mFloor = M(0x2b1d3c,.3,.12,{map:texFloor(HQ?1024:512), transparent:true, opacity:.92});
    var mCeil = M(0xd8cdea,.85), mFelt = M(0x5a3d7c,1), mFelt2 = M(0x704c93,1);
    var mTimber = M(0xa0714a,.55), mTimberD = M(0x6f4a30,.6);
    var mSolid = M(0xf0e9f8,.38), mStone = M(0x241834,.28,.25), mMetal = M(0x16101f,.35,.6);
    var mDesk = M(0xe9e2f2,.45), mScreen = M(0x0c0814,.25,.3,{emissive:0x2a2350, emissiveIntensity:.6});
    var mChair = [M(0x8a6fb8,.85), M(0x3e2b58,.85), M(0xc77b5a,.8)];
    var mSofa = M(0x6a4790,.95), mArm = M(0xc87a56,.85), mRug = M(0x3a2552,1), mPot = M(0xe8dfee,.6), mPotT = M(0xb0674a,.8);
    var mLeaf = [M(0x2e5c47,.8,0,{flatShading:true}), M(0x3f7a5a,.8,0,{flatShading:true}), M(0x24493a,.8,0,{flatShading:true})];
    var mGlass = new THREE.MeshStandardMaterial({color:0xcbb8ff, roughness:.05, metalness:.2, transparent:true, opacity:.13, depthWrite:false});
    var mFrost = new THREE.MeshStandardMaterial({color:0xe6dcff, roughness:.6, transparent:true, opacity:.32, depthWrite:false});
    var mShadow = new THREE.MeshBasicMaterial({map:RAD, color:0x000000, transparent:true, opacity:.55, depthWrite:false});

    /* helpers (boxes are built with their pivot on the bottom face) */
    var geoCache = {};
    function gBox(w,h,d){ var k = w+'|'+h+'|'+d; if (!geoCache[k]){ var g = new THREE.BoxGeometry(w,h,d); g.translate(0,h/2,0); geoCache[k] = g; } return geoCache[k]; }
    function add(o, parent, shadow){ (parent||root).add(o); if (HQ && shadow !== false){ o.castShadow = true; o.receiveShadow = true; } return o; }
    function box(w,h,d,x,y,z,m,parent,shadow){ var o = new THREE.Mesh(gBox(w,h,d), m); o.position.set(x,y,z); return add(o,parent,shadow); }
    function cyl(rt,rb,h,x,y,z,m,parent,seg){ var g = new THREE.CylinderGeometry(rt,rb,h,seg||24); g.translate(0,h/2,0); var o = new THREE.Mesh(g,m); o.position.set(x,y,z); return add(o,parent); }
    function group(x,y,z,parent){ var g = new THREE.Group(); g.position.set(x||0,y||0,z||0); (parent||root).add(g); return g; }
    function blob(w,d,x,z,parent,op){ var p = new THREE.Mesh(new THREE.PlaneGeometry(w,d), op ? mShadow.clone() : mShadow); if (op) p.material.opacity = op; p.rotation.x = -Math.PI/2; p.position.set(x,.008,z); p.renderOrder = 1; (parent||root).add(p); return p; }

    /* appear-on-build registry */
    var items = [];
    function reg(o, at, dur, kind){ items.push({o:o, a:at, d:dur||.4, k:kind||'drop', py:o.position.y, s:o.scale.clone()}); return o; }
    function applyBuild(B){
      for (var i=0;i<items.length;i++){
        var it = items[i], t = sat((B - it.a)/it.d), o = it.o;
        o.visible = t > .002;
        if (!o.visible) continue;
        if (it.k === 'drop'){ var e = outCubic(t); o.position.y = it.py + (1-e)*2.8; o.scale.set(it.s.x*e, it.s.y*e, it.s.z*e); }
        else if (it.k === 'rise'){ o.scale.set(it.s.x, it.s.y*outCubic(t), it.s.z); }
        else { var b = outBack(t); o.scale.set(it.s.x*b, it.s.y*b, it.s.z*b); }
      }
    }

    /* light zones: switched in a choreographed sequence */
    var ZL = [], Z = {};
    function zone(id, delay, thr, k){ var z = {id:id, delay:delay, thr:thr, k:k||3.4, lights:[], pools:[], want:false, state:false, at:0, tc:-9, v:0, g:0, jit:.85+rnd()*.35}; z.mat = new THREE.MeshStandardMaterial({color:0x0b0712, emissive:0xffffff, emissiveIntensity:0, roughness:.5, side:THREE.DoubleSide}); ZL.push(z); Z[id] = z; return z; }
    zone('cove',0,3.02,1.5); zone('recep',.38,3.16,1.9); zone('meet',.72,3.3,1.9); zone('work',1.02,3.46,1.8); zone('lounge',1.32,3.62,1.9); zone('kick',1.62,3.78,1.8);
    function glow(zid,w,h,d,x,y,z,parent,noMirror){ var o = box(w,h,d,x,y,z,Z[zid].mat,parent,false); if (!noMirror) mirror(o); return o; }
    function pool(zid,w,h,x,y,z,rx,ry,k,tex){
      var m = new THREE.MeshBasicMaterial({map:tex||RAD, color:0xffffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false});
      var p = new THREE.Mesh(new THREE.PlaneGeometry(w,h), m); p.position.set(x,y,z); p.rotation.set(rx||0, ry||0, 0); p.renderOrder = 2; root.add(p);
      Z[zid].pools.push({m:m, k:k}); return p;
    }
    var nLights = 0;
    function plight(zid,x,y,z,k,dist,opt){ if (!HQ && (opt || nLights >= 4)) return; var l = new THREE.PointLight(0xffffff, 0, dist||9, 2); l.position.set(x,y,z); root.add(l); Z[zid].lights.push({l:l, k:k}); nLights++; }
    var mirrors = [];
    function mirror(o){ var c = new THREE.Mesh(o.geometry, o.material); c.matrixAutoUpdate = false; mirrorGroup.add(c); mirrors.push([o,c]); }
    var Rm = new THREE.Matrix4().makeScale(1,-1,1);
    function chainVisible(o){ while (o){ if (!o.visible) return false; o = o.parent; } return true; }

    /* ===== SHELL & CORE ===== */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W,D), mFloor); floor.rotation.x = -Math.PI/2; floor.receiveShadow = HQ; floor.renderOrder = 0; root.add(floor);
    box(W+.3,H,.3, -.15,0,Z0-.15, mWall);           // back wall
    box(.3,H,D, X0-.15,0,0, mWall2);                // left wall
    box(W+.3,.04,.3, -.15,H,Z0-.15, mCap, null, false); box(.3,.04,D, X0-.15,H,0, mCap, null, false);
    box(W+.3,.42,.3, -.15,-.42,D/2+.15, mSkirt, null, false); box(.3,.42,D+.3, W/2+.15,-.42,0, mSkirt, null, false);
    // plinth below the slab: matches the void and hides floor reflections that would poke out past the edge
    var mVoid = new THREE.MeshBasicMaterial({color:NIGHT, toneMapped:false});
    box(W+.32,5,.3, -.15,-5.42,D/2+.15, mVoid, null, false); box(.3,5,D+.32, W/2+.15,-5.42,0, mVoid, null, false);
    cyl(.32,.32,H, -1.4,0,1.0, M(0x54456a,.9));      // structural column
    // window on the left wall with the city at night
    var city = new THREE.Mesh(new THREE.PlaneGeometry(5,2.6), new THREE.MeshBasicMaterial({map:texCity(), color:0xb9b0c8}));
    city.rotation.y = Math.PI/2; city.position.set(X0+.02, 2.05, 4.1); root.add(city);
    var mFrame = M(0x120c1a,.4,.5);
    box(.08,.08,5.1, X0+.05,.72,4.1, mFrame, null, false); box(.08,.08,5.1, X0+.05,3.34,4.1, mFrame, null, false);
    for (var wi=0; wi<5; wi++) box(.07,2.62,.06, X0+.05,.74,1.6+wi*1.25, mFrame, null, false);

    /* ===== PLAN OVERLAY (survey + design) ===== */
    var planMat = new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0, depthWrite:false});
    var gridMat = new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0, depthWrite:false});
    var gp = [], i2;
    for (i2=-8;i2<=8;i2++){ gp.push(i2,.02,Z0, i2,.02,-Z0); }
    for (i2=-6;i2<=6;i2++){ gp.push(X0,.02,i2, -X0,.02,i2); }
    var grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gp,3)), gridMat); grid.renderOrder = 3; root.add(grid);
    var pl = [];
    function rect(x1,z1,x2,z2){ pl.push(x1,.03,z1, x2,.03,z1,  x2,.03,z1, x2,.03,z2,  x2,.03,z2, x1,.03,z2,  x1,.03,z2, x1,.03,z1); }
    function circ(cx,cz,r,n){ for (var q=0;q<n;q++){ var a1 = q/n*Math.PI*2, a2 = (q+1)/n*Math.PI*2; pl.push(cx+Math.cos(a1)*r,.03,cz+Math.sin(a1)*r, cx+Math.cos(a2)*r,.03,cz+Math.sin(a2)*r); } }
    // dimension strings
    pl.push(X0,.03,D/2+.7, -X0,.03,D/2+.7); for (i2=0;i2<=6;i2++){ var dx = X0+i2*3; pl.push(dx,.03,D/2+.5, dx,.03,D/2+.9); }
    pl.push(W/2+.7,.03,Z0, W/2+.7,.03,-Z0); for (i2=0;i2<=7;i2++){ var dz = Z0+i2*2; pl.push(W/2+.5,.03,dz, W/2+.9,.03,dz); }
    rect(X0,Z0,-3,-2);           // meeting room
    rect(-8,.9,-3.4,2.5); rect(-8,3.9,-3.4,5.5); // desk clusters
    rect(1.3,-4.75,6.2,-3.65);   // reception counter
    pl.push(.6,.03,Z0+.2, 7.6,.03,Z0+.2); // slat wall line
    circ(4.6,3.1,2.3,40);        // lounge rug
    rect(-6.9,-5.05,-5.1,-3.95); // meeting table
    var planGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pl,3));
    var planLines = new THREE.LineSegments(planGeo, planMat); planLines.renderOrder = 3; root.add(planLines);
    var planCount = pl.length/3;
    var labels = [];
    function label(text,x,z,ry){ var m = new THREE.MeshBasicMaterial({map:texLabel(text), transparent:true, opacity:0, depthWrite:false}); var p = new THREE.Mesh(new THREE.PlaneGeometry(2,.5), m); p.rotation.set(-Math.PI/2,0,ry||0); p.position.set(x,.04,z); p.renderOrder = 3; root.add(p); labels.push(m); }
    label('18.00 m', 0, D/2+1.25); label('14.00 m', W/2+1.25, 0, Math.PI/2);
    var sweep = new THREE.Mesh(new THREE.PlaneGeometry(.12, D), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
    sweep.rotation.x = -Math.PI/2; sweep.position.y = .03; sweep.renderOrder = 3; root.add(sweep);

    /* ===== CEILING (B 0 - 1) ===== */
    var bulkA = group(0,H-.5,0); box(W,.5,1.6, 0,0,Z0+.8, mCeil, bulkA); reg(bulkA, 0, .4);
    var bulkB = group(0,H-.5,0); box(1.6,.5,D-1.6, X0+.8,0,.8, mCeil, bulkB); reg(bulkB, .06, .4);
    // cove light lines under the bulkhead edges + the wash they throw down the walls
    var coveA = group(0,H-.56,0); glow('cove',W-1.7,.05,.07, .85,0,Z0+1.62, coveA); reg(coveA,.3,.3);
    var coveB = group(0,H-.56,0); glow('cove',.07,.05,D-1.7, X0+1.62,0,.85+.0, coveB); reg(coveB,.34,.3);
    pool('cove',W-2,2.8, 1,H-1.95,Z0+.02, 0,0, .5, WASH);
    pool('cove',D-3,2.8, X0+.02,H-1.95,-1.6, 0,Math.PI/2, .42, WASH);
    plight('cove', 0,3.1,Z0+2.4, 1.1, 11, true);
    // acoustic felt baffles over the open workspace
    for (var bi=0; bi<12; bi++){
      var bg = group(-8.1+bi*.46, H-.62, 3.2);
      box(.07,.5,5.4, 0,0,0, bi%3===1 ? mFelt2 : mFelt, bg);
      reg(bg, .12 + bi*.045, .35);
    }

    /* ===== PARTITIONS (B .45 - 1.3): glass meeting room ===== */
    var glassG = group(0,0,0);
    function pane(len, x, z, alongX){
      var gm = new THREE.Mesh(gBox(alongX?len:.03, 3.5, alongX?.03:len), mGlass); gm.position.set(x,0,z); gm.renderOrder = 1; glassG.add(gm);
      var fm = new THREE.Mesh(gBox(alongX?len:.035, .28, alongX?.035:len), mFrost); fm.position.set(x,1.15,z); fm.renderOrder = 1; glassG.add(fm);
    }
    pane(4.6, -6.7, -2, true); pane(5, -3, -4.5, false);
    box(6,.06,.08, -6,3.5,-2, mFrame, glassG); box(.08,.06,5, -3,3.5,-4.5, mFrame, glassG);
    box(6,.04,.08, -6,0,-2, mFrame, glassG); box(.08,.04,5, -3,0,-4.5, mFrame, glassG);
    [-9+.04,-7.5,-6,-4.4,-3].forEach(function(x){ box(.05,3.5,.06, x,0,-2, mFrame, glassG); });
    [-7+.04,-5.75,-4.5,-3.25].forEach(function(z){ box(.06,3.5,.05, -3,0,z, mFrame, glassG); });
    reg(glassG, .5, .7, 'rise');
    // meeting room back wall: screen + credenza
    var meetWall = group(0,0,0); box(2.4,1.35,.06, -6,1.1,Z0+.06, mScreen, meetWall); box(3.4,.62,.5, -6,0,Z0+.3, mTimberD, meetWall); reg(meetWall, .95, .4, 'rise');

    /* ===== JOINERY (B 1 - 2): slatted timber wall + reception ===== */
    var slatGlowBack = pool('recep',7.2,3.3, 4.05,1.8,Z0+.025, 0,0, .55, RAD);
    for (var si=0; si<24; si++){ var sg = group(.6+si*.3, .18, Z0+.13); box(.13,3.2,.1, 0,0,0, si%5===2 ? mTimberD : mTimber, sg); reg(sg, 1.0+si*.022, .3, 'rise'); }
    var slatStrips = group(0,0,0); glow('recep',7.3,.035,.035, 4.05,.12,Z0+.07, slatStrips); glow('recep',7.3,.035,.035, 4.05,3.42,Z0+.07, slatStrips); reg(slatStrips, 1.5, .25, 'grow');
    var logo = new THREE.Mesh(new THREE.TorusGeometry(.42,.035,12,64), Z['recep'].mat); logo.position.set(4.05,2.25,Z0+.26); root.add(logo); mirror(logo); reg(logo, 1.6, .3, 'grow');
    var logoDot = new THREE.Mesh(new THREE.SphereGeometry(.11,20,14), Z['recep'].mat); logoDot.position.set(4.05,2.25,Z0+.26); root.add(logoDot); reg(logoDot, 1.65, .3, 'grow');
    var recep = group(3.75,0,-4.2);
    box(4.6,1.04,.86, 0,.06,0, mSolid, recep); box(4.9,.06,1.08, 0,1.1,-.06, mStone, recep); box(4.5,.06,.7, 0,0,0, mStone, recep, false);
    box(.56,.34,.03, -1,1.16,-.25, mScreen, recep);
    glow('kick',4.45,.03,.03, 0,.04,.45, recep);
    blob(6,2.2, 0,.1, recep);
    reg(recep, 1.42, .45, 'rise');
    // pendant globes over the counter
    for (var pi=0; pi<3; pi++){
      var pg = group(2.55+pi*1.2, 0, -4.15);
      var cord = new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,1.6,4), mMetal); cord.position.y = H-.8; pg.add(cord);
      var gl1 = new THREE.Mesh(new THREE.SphereGeometry(.2,24,16), Z['recep'].mat); gl1.position.y = H-1.8; pg.add(gl1); mirror(gl1);
      reg(pg, 1.6+pi*.06, .35);
    }
    pool('recep',4.8,3.2, 3.75,.012,-3.9, -Math.PI/2,0, .55);
    plight('recep', 3.8,2.3,-3.3, 2.1, 8.5);
    // linear pendant in the meeting room
    var mlp = group(-6,2.55,-4.5);
    box(3,.07,.14, 0,0,0, mMetal, mlp, false); glow('meet',2.9,.025,.1, 0,-.025,0, mlp);
    [-1.3,1.3].forEach(function(x){ var c2 = new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,1.4,4), mMetal); c2.position.set(x,.7,0); mlp.add(c2); });
    reg(mlp, 1.62, .35);
    pool('meet',4.6,3.4, -6,.012,-4.5, -Math.PI/2,0, .5);
    plight('meet', -6,2.25,-4.5, 1.9, 7);
    // linear pendants over the desks
    [1.7,4.7].forEach(function(z, n){
      var lp = group(-5.7,2.75,z);
      box(4.2,.06,.12, 0,0,0, mMetal, lp, false); glow('work',4.1,.025,.09, 0,-.025,0, lp);
      reg(lp, 1.7+n*.06, .35);
      pool('work',5.6,3, -5.7,.012,z, -Math.PI/2,0, .42);
      plight('work', -5.7,2.4,z, 1.25, 6.5, n === 1);
    });
    // light ring over the lounge
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.7,.045,10,96), Z['lounge'].mat); ring.rotation.x = Math.PI/2; ring.position.set(4.6,3.15,3.1); root.add(ring); mirror(ring); reg(ring, 1.76, .35, 'grow');
    var rc = []; for (var ri=0; ri<3; ri++){ var a3 = ri/3*Math.PI*2; var c3 = new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.85,4), mMetal); c3.position.set(4.6+Math.cos(a3)*1.7, 3.6, 3.1+Math.sin(a3)*1.7); root.add(c3); reg(c3, 1.76, .35, 'grow'); }
    pool('lounge',6,6, 4.6,.012,3.1, -Math.PI/2,0, .5);
    plight('lounge', 4.6,2.6,3.1, 1.9, 8);
    // floor-level glow along the slab edge (the model's own "kick" line)
    var edge = group(0,0,0); glow('kick',W+.3,.03,.03, -.15,-.03,D/2+.31, edge, true); glow('kick',.03,.03,D+.3, W/2+.31,-.03,0, edge, true); reg(edge, 1.9, .3, 'grow');

    /* ===== FURNITURE (B 2 - 3) ===== */
    var dummy = new THREE.Object3D();
    function inst(geo, mat, list, parent){
      var im = new THREE.InstancedMesh(geo, mat, list.length);
      for (var q=0;q<list.length;q++){ var L = list[q]; dummy.position.set(L[0],L[1],L[2]); dummy.rotation.set(0,L[3]||0,0); dummy.updateMatrix(); im.setMatrixAt(q, dummy.matrix); }
      im.frustumCulled = false;
      return add(im, parent);
    }
    function chairs(list, parent, matIdx){
      var seats = [], backs = [], posts = [];
      list.forEach(function(c){ var s = Math.sin(c[2]), co = Math.cos(c[2]); seats.push([c[0],.42,c[1],c[2]]); backs.push([c[0]-s*.24,.47,c[1]-co*.24,c[2]]); posts.push([c[0],0,c[1],0]); });
      inst(gBox(.48,.08,.46), mChair[matIdx||0], seats, parent);
      inst(gBox(.46,.48,.06), mChair[matIdx||0], backs, parent);
      inst(new THREE.CylinderGeometry(.03,.16,.42,8).translate(0,.21,0), mMetal, posts, parent);
    }
    [1.7,4.7].forEach(function(cz, n){
      if (!HQ && n === 1) return;
      var dg = group(0,0,0), tops = [], legs = [], mons = [], ch = [];
      for (var c=0;c<3;c++){
        var x = -7.25 + c*1.55;
        [-.42,.42].forEach(function(o, side){
          tops.push([x,.72,cz+o]); legs.push([x-.7,0,cz+o]); legs.push([x+.7,0,cz+o]);
          mons.push([x,.8,cz+o*.35+(side?.08:-.08), side?0:Math.PI]);
          ch.push([x+(rnd()-.5)*.25, cz+o*2.4, side ? Math.PI : 0]);
        });
      }
      inst(gBox(1.5,.045,.8), mDesk, tops, dg);
      inst(gBox(.05,.72,.74), mMetal, legs, dg);
      inst(gBox(.62,.38,.03), mScreen, mons, dg);
      blob(5.6,2.6, -5.7,cz, dg, .6);
      reg(dg, 2.0+n*.12, .4);
      var cg = group(0,0,0); chairs(ch, cg, n); reg(cg, 2.2+n*.12, .4);
    });
    var mt = group(-6,0,-4.5);
    box(3.1,.06,1.2, 0,.7,0, mTimber, mt); box(.12,.7,.7, -1,0,0, mMetal, mt); box(.12,.7,.7, 1,0,0, mMetal, mt);
    blob(4.4,2.6, 0,0, mt, .6);
    reg(mt, 2.05, .4);
    var mc = group(-6,0,-4.5); chairs([[-1,-1,0],[0,-1,0],[1,-1,0],[-1,1,Math.PI],[0,1,Math.PI],[1,1,Math.PI]], mc, 1); reg(mc, 2.25, .4);
    // lounge
    var lg = group(4.6,0,3.1);
    cyl(2.2,2.2,.02, 0,0,0, mRug, lg, 48);
    box(3.4,.42,1.0, 0,.06,-1.25, mSofa, lg); box(3.4,.5,.3, 0,.4,-1.7, mSofa, lg);
    box(.3,.62,1.0, -1.85,.06,-1.25, mSofa, lg); box(.3,.62,1.0, 1.85,.06,-1.25, mSofa, lg);
    cyl(.55,.55,.05, 0,.4,.15, mSolid, lg, 40); cyl(.06,.06,.4, 0,0,.15, mMetal, lg, 8);
    var arm = group(1.5,0,1.1, lg); arm.rotation.y = -.7; box(.9,.4,.85, 0,.06,0, mArm, arm); box(.9,.45,.2, 0,.38,-.35, mArm, arm);
    blob(5,3.6, 0,-.6, lg, .55);
    reg(lg, 2.3, .45);
    // arc floor lamp
    var lamp = group(7.2,0,1.2); cyl(.18,.2,.04, 0,0,0, mMetal, lamp, 16);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,2.2,6), mMetal); pole.position.y = 1.1; lamp.add(pole);
    var shadeL = new THREE.Mesh(new THREE.SphereGeometry(.26,20,12,0,Math.PI*2,0,Math.PI/2), Z['lounge'].mat); shadeL.position.y = 2.2; shadeL.rotation.x = Math.PI; lamp.add(shadeL); mirror(shadeL);
    reg(lamp, 2.55, .35);
    // plants
    var leafGeo = new THREE.IcosahedronGeometry(.24,0);
    function plant(x,z,s,terracotta){
      var g = group(x,0,z);
      cyl(.34*s,.26*s,.62*s, 0,0,0, terracotta ? mPotT : mPot, g, 20);
      for (var q=0;q<9;q++){ var a4 = q*2.4, rr = (.1 + (q%3)*.12)*s; var lf = new THREE.Mesh(leafGeo, mLeaf[q%3]); lf.position.set(Math.cos(a4)*rr, (.85 + q*.13)*s, Math.sin(a4)*rr); lf.scale.set(s*(1-q*.05), s*(1.5-q*.06), s*(1-q*.05)); lf.rotation.set(rnd()*.6-.3, a4, rnd()*.6-.3); add(lf, g); }
      blob(1.4*s,1.4*s,0,0,g,.5);
      reg(g, 2.6+rnd()*.25, .35, 'grow');
    }
    plant(7.9,-5.9,1.2,false); plant(8,6,1.1,true); plant(-2.4,-1.3,.9,true);
    if (HQ){ plant(-8.2,6.3,1,false); plant(-3.6,-6.3,.8,false); }

    /* dust in the light */
    var dust = null;
    if (HQ){
      var n = 260, arr = new Float32Array(n*3);
      for (var k=0;k<n;k++){ arr[k*3] = (rnd()-.5)*W*.9; arr[k*3+1] = rnd()*H; arr[k*3+2] = (rnd()-.5)*D*.9; }
      var dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(arr,3));
      dust = new THREE.Points(dgeo, new THREE.PointsMaterial({color:0xffffff, size:.035, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
      root.add(dust);
    }

    /* base lighting: always on, so the shell reads with the fit-out lights off */
    var hemi = new THREE.HemisphereLight(0x8e74c4, 0x1a1026, .4); scene.add(hemi);
    var key = new THREE.DirectionalLight(0xcfc4ff, .42); key.position.set(10,16,12); scene.add(key); scene.add(key.target);
    if (HQ){ key.castShadow = true; key.shadow.mapSize.set(2048,2048); var sc = key.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 50; key.shadow.bias = -.0006; key.shadow.normalBias = .03; }
    var torch = null;
    if (HQ && hero){ torch = new THREE.PointLight(0xffffff, 0, 7, 2); torch.position.set(3,1.4,3); scene.add(torch); }

    /* ---------- palette ---------- */
    var cur = new THREE.Color(PAL[GP.palette] || PAL.amber), tgt = cur.clone(), hot = new THREE.Color(), lightC = new THREE.Color(), WHITE = new THREE.Color(0xffffff);
    // the post chain stores linear colour and gamma-encodes at the end, so the void must be linear there
    var bgBase = new THREE.Color(NIGHT); if (post) bgBase.convertSRGBToLinear();
    var bgC = new THREE.Color(), hemiBase = new THREE.Color(0x8e74c4);

    /* ---------- state ---------- */
    var first = document.documentElement.classList.contains('first');
    var introAt = performance.now()/1000 + (reduce ? .1 : first ? 1.05 : .35);
    var ready = false, pulse = false;
    var sS = hero && !reduce ? (GP.story ? GP.story.S : 0) : 0;
    GP.on(function(type){
      if (type === 'palette') tgt.setHex(PAL[GP.palette] || PAL.amber);
      if (type === 'lights') pulse = true;
    });

    // pointer: parallax + torch
    var mx = 0, my = 0, smx = 0, smy = 0, torchOn = 0, lastMove = 0;
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0), -1.3), hit = new THREE.Vector3(3,1.3,3);
    if (!reduce) window.addEventListener('pointermove', function(e){
      if (e.pointerType === 'touch') return;
      mx = e.clientX/window.innerWidth - .5; my = e.clientY/window.innerHeight - .5;
      if (!torch) return;
      var r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      mouse.x = ((e.clientX-r.left)/r.width)*2-1; mouse.y = -((e.clientY-r.top)/r.height)*2+1;
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(plane, hit)){ hit.x = Math.max(-8.5,Math.min(8.5,hit.x)); hit.z = Math.max(-6.5,Math.min(6.5,hit.z)); lastMove = performance.now(); }
    }, {passive:true});

    /* ---------- sizing ---------- */
    var cw = 1, ch2 = 1, lowDpr = false;
    function size(){
      cw = canvas.clientWidth || 1; ch2 = canvas.clientHeight || 1;
      var dpr = Math.min(window.devicePixelRatio||1, small ? 1.5 : usePost ? 1.5 : 2);
      if (lowDpr) dpr = 1;
      renderer.setPixelRatio(dpr);
      renderer.setSize(cw, ch2, false);
      if (post) post.setSize(Math.round(cw*dpr), Math.round(ch2*dpr));
      camera.aspect = cw/ch2;
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);

    /* ---------- camera ---------- */
    var cp = new THREE.Vector3(), ct = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    function vec(a){ return tmpA.set(a[0],a[1],a[2]); }
    function cr(p0,p1,p2,p3,t,i){ var t2 = t*t, t3 = t2*t; return .5*((2*p1[i]) + (-p0[i]+p2[i])*t + (2*p0[i]-5*p1[i]+4*p2[i]-p3[i])*t2 + (-p0[i]+3*p1[i]-3*p2[i]+p3[i])*t3); }
    function storyCam(S, out, outT){
      var n = KEYS.length - 1, s = Math.max(0, Math.min(n, S)), k = Math.min(n-1, Math.floor(s)), f = smooth(s - k);
      var a = V[KEYS[Math.max(0,k-1)].v], b = V[KEYS[k].v], c = V[KEYS[k+1].v], d = V[KEYS[Math.min(n,k+2)].v];
      out.set(cr(a.p,b.p,c.p,d.p,f,0), cr(a.p,b.p,c.p,d.p,f,1), cr(a.p,b.p,c.p,d.p,f,2));
      outT.set(cr(a.t,b.t,c.t,d.t,f,0), cr(a.t,b.t,c.t,d.t,f,1), cr(a.t,b.t,c.t,d.t,f,2));
      return lerp(b.f, c.f, f);
    }
    function storyState(S){
      var n = KEYS.length - 1, s = Math.max(0, Math.min(n, S)), k = Math.min(n-1, Math.floor(s)), f = smooth(s - k);
      return {B: lerp(KEYS[k].B, KEYS[k+1].B, k === 0 ? f : (s-k)), P: lerp(KEYS[k].P, KEYS[k+1].P, f)};
    }

    /* ---------- flicker ---------- */
    var FLK = [[0,.85],[.05,.04],[.1,.7],[.15,.08],[.22,1],[.28,.3],[.34,1]];
    function flick(dt){ if (reduce) return sat(dt/.25); if (dt >= .42) return 1; var v = 0; for (var q=0;q<FLK.length;q++) if (dt >= FLK[q][0]) v = FLK[q][1]; return v; }

    /* ---------- loop ---------- */
    var running = false, inView = true, last = 0, t0 = performance.now(), perfN = 0, perfT = 0;
    function downgrade(){
      if (post){ post = null; usePost = false; bgBase.convertLinearToSRGB(); }
      key.castShadow = false; lowDpr = true;
      size();
    }
    function frame(nowMs){
      if (!running) return;
      requestAnimationFrame(frame);
      var now = nowMs/1000, dt = Math.min(.05, now - last); last = now;
      var t = (nowMs - t0)/1000;

      // story / view
      var B = 4, P = 0, fov;
      if (hero && !reduce){
        var S = GP.story ? GP.story.S : 0;
        sS += (S - sS) * damp(dt, 5.5);
        if (Math.abs(S - sS) < .0005) sS = S;
        var st = storyState(sS); B = st.B; P = st.P;
        fov = storyCam(sS, cp, ct);
      } else {
        var vw = V[hero ? 'hero' : view] || V.hero;
        cp.set(vw.p[0],vw.p[1],vw.p[2]); ct.set(vw.t[0],vw.t[1],vw.t[2]); fov = vw.f;
        if (!reduce){ cp.x += Math.sin(t*.12)*.5; cp.y += Math.sin(t*.09)*.18; }
      }
      // portrait screens: pull back + widen
      var asp = camera.aspect;
      if (hero){ tmpB.subVectors(cp, ct).multiplyScalar(1.07); cp.copy(ct).add(tmpB); }
      if (asp < 1.25){ var q2 = sat((1.25-asp)/.8); tmpB.subVectors(cp, ct).multiplyScalar(1 + q2*(hero ? .32 : .45)); cp.copy(ct).add(tmpB); fov += q2*(hero ? 12 : 14); }
      smx += (mx - smx) * damp(dt,3); smy += (my - smy) * damp(dt,3);
      cp.x += smx*1.4; cp.y -= smy*.8; cp.z -= smx*.6;
      camera.position.copy(cp); camera.lookAt(ct);
      if (Math.abs(camera.fov - fov) > .01){ camera.fov = fov; }
      // frame the room beside the copy
      if (hero && cw > 900) camera.setViewOffset(cw, ch2, -cw*.09, 0, cw, ch2);
      else if (hero) camera.setViewOffset(cw, ch2, 0, ch2*(.25 - .05*sat(sS*1.5)), cw, ch2);
      else if (cw > 900 && view !== 'lost') camera.setViewOffset(cw, ch2, -cw*.12, 0, cw, ch2);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();

      applyBuild(B);

      // plan overlay
      var planFade = 1 - sat(B/1.3);
      var cplan = P * planFade;
      gridMat.opacity = sat(P/.4) * .22 * planFade;
      planMat.opacity = .9 * planFade * sat(P*3);
      planGeo.setDrawRange(0, P > .02 ? Math.min(planCount, 34 + Math.floor((planCount-34) * sat((P-.3)/.7) / 2) * 2) : 0);
      labels.forEach(function(m){ m.opacity = sat(P/.3) * planFade * .8; });
      var survey = hero && !reduce ? sat(1 - Math.abs(sS - 2)*1.4) : 0;
      sweep.material.opacity = survey * .7; sweep.position.x = X0 + ((t*.22) % 1) * W;
      grid.visible = gridMat.opacity > .002; planLines.visible = cplan > .002 || planMat.opacity > .002; sweep.visible = survey > .01;

      // palette cross-fade
      cur.lerp(tgt, damp(dt, 2.6));
      hot.copy(cur).lerp(WHITE, .1);
      lightC.copy(cur).lerp(WHITE, .18);
      planMat.color.copy(hot); gridMat.color.copy(cur); sweep.material.color.copy(hot);
      labels.forEach(function(m){ m.color.copy(hot); });

      // lights choreography
      if (!ready && now >= introAt){ ready = true; pulse = true; }
      var total = 0;
      for (var zi=0; zi<ZL.length; zi++){
        var z = ZL[zi];
        var want = ready && GP.lights !== false && B >= z.thr;
        if (want !== z.want){
          z.want = want;
          z.at = now + (pulse ? (want ? z.delay : (ZL.length-1-zi)*.07) : 0);
        }
        if (z.state !== z.want && now >= z.at){ z.state = z.want; z.tc = now; }
        if (z.state) z.v = flick((now - z.tc) * z.jit);
        else z.v = Math.max(0, z.v - dt*(reduce ? 4 : 6));
        if (lost && zi === 3 && z.state){ var ph = t % 5.2; if (ph > 4.3) z.v *= (Math.sin(ph*90) > .2 ? 1 : .08); }
        z.g += (z.v - z.g) * damp(dt, z.v > z.g ? 3.2 : 5);
        z.mat.emissive.copy(hot); z.mat.emissiveIntensity = z.k * z.v;
        for (var li=0; li<z.lights.length; li++){ var L = z.lights[li]; L.l.color.copy(lightC); L.l.intensity = L.k * z.g; }
        for (var pi2=0; pi2<z.pools.length; pi2++){ var Pp = z.pools[pi2]; Pp.m.color.copy(cur); Pp.m.opacity = Pp.k * z.g; }
        total += z.g;
      }
      pulse = false;
      total /= ZL.length;
      // room tint follows the light
      bgC.copy(bgBase).lerp(cur, (post ? .006 : .03)*total); scene.background.copy(bgC); scene.fog.color.copy(bgC); mVoid.color.copy(bgC); if (!post) mVoid.color.convertSRGBToLinear();
      hemi.color.copy(hemiBase).lerp(cur, .25*total); hemi.intensity = .4 - .14*total;
      key.intensity = .42 - .14*total;
      if (dust){ dust.material.color.copy(hot); dust.material.opacity = .5*total; if (!reduce){ dust.rotation.y = t*.008; dust.position.y = Math.sin(t*.2)*.08; } }
      if (torch){
        var active = (performance.now() - lastMove) < 2600 ? 1 : 0;
        torchOn += (active - torchOn) * damp(dt, 2);
        torch.position.lerp(hit, damp(dt, 6)); torch.color.copy(lightC); torch.intensity = .9 * torchOn;
      }

      // reflections of the glowing parts in the polished floor
      scene.updateMatrixWorld();
      for (var mi=0; mi<mirrors.length; mi++){ var pr = mirrors[mi]; pr[1].visible = chainVisible(pr[0]); if (pr[1].visible){ pr[1].matrix.multiplyMatrices(Rm, pr[0].matrixWorld); pr[1].matrixWorldNeedsUpdate = true; } }

      // adaptive quality: a slow GPU drops post-processing and shadows after the first seconds
      if (HQ && t > 1.5 && t < 6){ perfN++; perfT += dt; if (perfN === 60 && perfT/perfN > .042) downgrade(); }
      if (post) post.render(scene, camera, .35 + .75*total, t);
      else renderer.render(scene, camera);
    }
    function update(){
      var should = inView && !document.hidden;
      if (should && !running){ running = true; last = performance.now()/1000; requestAnimationFrame(frame); }
      else if (!should) running = false;
    }
    if (window.IntersectionObserver) new IntersectionObserver(function(en){ inView = en[0].isIntersecting; update(); }, {rootMargin:'80px'}).observe(canvas);
    document.addEventListener('visibilitychange', update);
    canvas.addEventListener('webglcontextlost', function(e){ e.preventDefault(); running = false; canvas.parentElement.classList.add('no-webgl'); canvas.parentElement.classList.remove('is-live'); });
    update();
    canvas.parentElement.classList.add('is-live');
  }

  function hasWebGL(){
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function boot(){
    var ok = !!window.THREE && hasWebGL();
    document.querySelectorAll('canvas[data-scene]').forEach(function(c){
      try { if (!ok) throw new Error('webgl unavailable'); build(c); }
      catch (err) { c.parentElement.classList.add('no-webgl'); c.parentElement.classList.remove('is-live'); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
