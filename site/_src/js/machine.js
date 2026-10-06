/* The aerial screw, built in code for this page: a small WebGL2 renderer of our own,
   no library and no model file. A simpler model than the museum's reconstruction.
   Right of the chalk line it stands built, in one patch of low sun, with its shadow on the wall.
   Left of the line the same geometry is drawn as construction lines.
   It turns at 5 rpm, the museum's own speed. Without WebGL2 the poster picture simply stays. */
(function () {
  'use strict';

  var TAU = Math.PI * 2, RPM = 5, SPEED = RPM * TAU / 60;

  /* ---------- small matrix kit (column-major) ---------- */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function perspective(fovy, aspect, n, f) {
    var t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / aspect; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  }
  function ortho(h, n, f) {
    var o = new Float32Array(16);
    o[0] = 1 / h; o[5] = 1 / h; o[10] = -2 / (f - n); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function lookAt(eye, at, up) {
    var z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x), o = new Float32Array(16);
    o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    o[2] = z[0]; o[6] = z[1]; o[10] = z[2]; o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    o[15] = 1;
    return o;
  }
  function rotY(a) {
    var c = Math.cos(a), s = Math.sin(a), o = new Float32Array(16);
    o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1;
    return o;
  }

  /* ---------- built geometry: position 3, normal 3, uv 2, material 1 ---------- */
  var LINEN = 0, WOOD = 1, DARK = 2, ROPE = 3, PLANK = 4, FLOOR = 5, WALL = 6;

  function Mesh() { this.v = []; }
  Mesh.prototype.tri = function (a, b, c, na, nb, nc, ua, ub, uc, m) {
    this.v.push(a[0], a[1], a[2], na[0], na[1], na[2], ua[0], ua[1], m,
                b[0], b[1], b[2], nb[0], nb[1], nb[2], ub[0], ub[1], m,
                c[0], c[1], c[2], nc[0], nc[1], nc[2], uc[0], uc[1], m);
  };
  Mesh.prototype.quad = function (a, b, c, d, m, n) {
    n = n || norm(cross(sub(b, a), sub(d, a)));
    this.tri(a, b, c, n, n, n, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]], m);
    this.tri(a, c, d, n, n, n, [a[0], a[2]], [c[0], c[2]], [d[0], d[2]], m);
  };
  /* a tube between two points, round or square in section */
  Mesh.prototype.tube = function (p0, p1, r0, r1, seg, m) {
    var ax = norm(sub(p1, p0));
    var side = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var u = norm(cross(ax, side)), w = cross(ax, u), ring = [];
    for (var i = 0; i <= seg; i++) {
      var a = i / seg * TAU + (seg === 4 ? Math.PI / 4 : 0), c = Math.cos(a), s = Math.sin(a);
      var n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      ring.push([n, [p0[0] + n[0] * r0, p0[1] + n[1] * r0, p0[2] + n[2] * r0],
                    [p1[0] + n[0] * r1, p1[1] + n[1] * r1, p1[2] + n[2] * r1]]);
    }
    for (i = 0; i < seg; i++) {
      var A = ring[i], B = ring[i + 1];
      if (seg === 4) {
        var fn = norm([A[0][0] + B[0][0], A[0][1] + B[0][1], A[0][2] + B[0][2]]);
        this.tri(A[1], B[1], B[2], fn, fn, fn, [0, 0], [1, 0], [1, 1], m);
        this.tri(A[1], B[2], A[2], fn, fn, fn, [0, 0], [1, 1], [0, 1], m);
      } else {
        this.tri(A[1], B[1], B[2], A[0], B[0], B[0], [i / seg, 0], [(i + 1) / seg, 0], [(i + 1) / seg, 1], m);
        this.tri(A[1], B[2], A[2], A[0], B[0], A[0], [i / seg, 0], [(i + 1) / seg, 1], [i / seg, 1], m);
      }
    }
  };
  /* a turned profile round the vertical axis: [[radius, height], ...] */
  Mesh.prototype.lathe = function (prof, seg, m) {
    for (var k = 0; k < prof.length - 1; k++) {
      var r0 = prof[k][0], y0 = prof[k][1], r1 = prof[k + 1][0], y1 = prof[k + 1][1];
      var dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
        var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        var A = [r0 * c0, y0, r0 * s0], B = [r0 * c1, y0, r0 * s1], C = [r1 * c1, y1, r1 * s1], D = [r1 * c0, y1, r1 * s0];
        var n0 = [nr * c0, ny, nr * s0], n1 = [nr * c1, ny, nr * s1];
        this.tri(A, B, C, n0, n1, n1, [A[0], A[2]], [B[0], B[2]], [C[0], C[2]], m);
        this.tri(A, C, D, n0, n1, n0, [A[0], A[2]], [C[0], C[2]], [D[0], D[2]], m);
      }
    }
  };

  /* ---------- line geometry: end a 3, end b 3, which end 1, side 1, kind 1 ---------- */
  function Lines() { this.v = []; }
  Lines.prototype.seg = function (a, b, kind) {
    var k = kind || 0, q = [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]];
    for (var i = 0; i < 6; i++) this.v.push(a[0], a[1], a[2], b[0], b[1], b[2], q[i][0], q[i][1], k);
  };
  Lines.prototype.circle = function (y, r, n, kind) {
    for (var i = 0; i < n; i++) {
      var t0 = i / n * TAU, t1 = (i + 1) / n * TAU;
      this.seg([r * Math.cos(t0), y, r * Math.sin(t0)], [r * Math.cos(t1), y, r * Math.sin(t1)], kind);
    }
  };

  /* The sail: a spiral surface that narrows as it climbs the mast. */
  var TURNS = 1.95, Y0 = 2.05, RISE = 3.15, RIN = 0.085;
  function sailR(s) { return 0.4 + 2.8 * Math.pow(1 - s, 1.12); }
  function sailP(s, q) {
    var th = s * TURNS * TAU, R = sailR(s), r = RIN + q * (R - RIN);
    return [r * Math.cos(th), Y0 + RISE * s - 0.16 * R * q * q, r * Math.sin(th)];
  }
  function sailN(s, q) {
    var e = 0.0015, a = sub(sailP(s + e, q), sailP(s - e, q)), b = sub(sailP(s, Math.min(1, q + e)), sailP(s, Math.max(0, q - e)));
    return norm(cross(b, a));
  }

  function build() {
    var still = new Mesh(), spin = new Mesh(), ls = new Lines(), lr = new Lines(), i, k, a, cx, sz;

    // the hall: a floor and one wall to carry the shadow
    still.quad([-30, 0, 16], [30, 0, 16], [30, 0, -3.6], [-30, 0, -3.6], FLOOR, [0, 1, 0]);
    still.quad([-30, 0, -3.6], [30, 0, -3.6], [30, 14, -3.6], [-30, 14, -3.6], WALL, [0, 0, 1]);

    // the round base of planks, with its raised rim and the socket for the mast
    still.lathe([[0, 0.17], [2.34, 0.17], [2.34, 0.25], [2.47, 0.25], [2.47, 0]], 72, PLANK);
    still.lathe([[0, 0.5], [0.24, 0.5], [0.3, 0.17]], 20, DARK);
    ls.circle(0, 2.47, 72); ls.circle(0.25, 2.47, 72); ls.circle(0.25, 2.34, 72);
    ls.circle(0.17, 0.3, 24); ls.circle(0.5, 0.24, 24);
    for (i = 0; i < 12; i++) {
      a = i * TAU / 12;
      ls.seg([2.47 * Math.cos(a), 0, 2.47 * Math.sin(a)], [2.47 * Math.cos(a), 0.25, 2.47 * Math.sin(a)]);
    }
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2 + Math.PI / 4; cx = Math.cos(a); sz = Math.sin(a);
      still.tube([1.05 * cx, 0.17, 1.05 * sz], [0.13 * cx, 0.92, 0.13 * sz], 0.06, 0.06, 4, DARK);
      ls.seg([1.05 * cx, 0.17, 1.05 * sz], [0.13 * cx, 0.92, 0.13 * sz]);
    }
    still.lathe([[0.2, 0.86], [0.2, 1.0], [0, 1.0]], 20, DARK);
    ls.circle(1.0, 0.2, 20);
    // construction: the axis, the sail's reach on the floor, its centre
    ls.seg([0, -0.6, 0], [0, 6.5, 0], 1);
    ls.circle(0.01, sailR(0), 96, 1);
    ls.seg([-0.3, 0.01, 0], [0.3, 0.01, 0], 1); ls.seg([0, 0.01, -0.3], [0, 0.01, 0.3], 1);

    // the mast, its collars and its head
    spin.lathe([[0.1, 0.5], [0.1, 1.02], [0.17, 1.02], [0.17, 1.42], [0.095, 1.42], [0.085, 2.0], [0.06, 5.5], [0.085, 5.52], [0.085, 5.6], [0, 5.66]], 20, WOOD);
    spin.lathe([[0.13, 2.02], [0.13, 2.12], [0.085, 2.12]], 16, DARK);
    lr.seg([0, 0.5, 0], [0, 5.66, 0]);
    lr.circle(1.02, 0.17, 16); lr.circle(1.42, 0.17, 16); lr.circle(5.56, 0.085, 12);
    // the four bars a crew pushes, and the stays up to the mast
    for (i = 0; i < 4; i++) {
      a = i * Math.PI / 2; cx = Math.cos(a); sz = Math.sin(a);
      spin.tube([0.12 * cx, 1.22, 0.12 * sz], [1.72 * cx, 1.22, 1.72 * sz], 0.05, 0.04, 10, WOOD);
      spin.tube([1.72 * cx, 1.22, 1.72 * sz], [1.9 * cx, 1.22, 1.9 * sz], 0.03, 0.03, 8, DARK);
      spin.tube([1.66 * cx, 1.24, 1.66 * sz], [0.09 * cx, 2.04, 0.09 * sz], 0.011, 0.011, 5, ROPE);
      lr.seg([0.12 * cx, 1.22, 0.12 * sz], [1.9 * cx, 1.22, 1.9 * sz]);
      lr.seg([1.66 * cx, 1.24, 1.66 * sz], [0.09 * cx, 2.04, 0.09 * sz]);
    }

    // the linen
    var NS = 250, NQ = 9;
    for (i = 0; i < NS; i++) for (k = 0; k < NQ; k++) {
      var s0 = i / NS, s1 = (i + 1) / NS, q0 = k / NQ, q1 = (k + 1) / NQ;
      var A = sailP(s0, q0), B = sailP(s1, q0), C = sailP(s1, q1), D = sailP(s0, q1);
      var u0 = s0 * TURNS, u1 = s1 * TURNS;
      spin.tri(A, B, C, sailN(s0, q0), sailN(s1, q0), sailN(s1, q1), [u0, q0], [u1, q0], [u1, q1], LINEN);
      spin.tri(A, C, D, sailN(s0, q0), sailN(s1, q1), sailN(s0, q1), [u0, q0], [u1, q1], [u0, q1], LINEN);
    }
    // the ribs under the linen, one every thirty degrees, and the rope along its edge
    var ribs = Math.round(TURNS * 12);
    function lift(p, d) { return [p[0], p[1] + d, p[2]]; }
    for (i = 0; i <= ribs; i++) {
      var s = Math.min(1, i / (TURNS * 12)), edge = (i === 0 || i === ribs);
      spin.tube(lift(sailP(s, 0), -0.03), lift(sailP(s, 1), -0.03), edge ? 0.036 : 0.022, edge ? 0.028 : 0.016, 7, WOOD);
      lr.seg(sailP(s, 0), sailP(s, 1));
    }
    for (i = 0; i < NS; i++) {
      spin.tube(sailP(i / NS, 1), sailP((i + 1) / NS, 1), 0.017, 0.017, 5, ROPE);
      if (i % 2 === 0) lr.seg(sailP(i / NS, 1), sailP(Math.min(1, (i + 2) / NS), 1));
    }
    return {
      still: new Float32Array(still.v), spin: new Float32Array(spin.v),
      ls: new Float32Array(ls.v), lr: new Float32Array(lr.v)
    };
  }

  /* ---------- shaders ---------- */
  var VS = '#version 300 es\n' +
    'layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec2 aUV;layout(location=3) in float aMat;' +
    'uniform mat4 uModel,uVP,uLight;uniform float uFlip;out vec3 vPos,vNor,vObj;out vec2 vUV;out float vMat;out vec4 vL;' +
    // uFlip -1 draws the hall upside down under the floor: its reflection. The light is still worked out on the upright point.
    'void main(){vec4 w=uModel*vec4(aPos,1.);vPos=w.xyz;vObj=aPos;vNor=mat3(uModel)*aNor;vUV=aUV;vMat=aMat;vL=uLight*w;gl_Position=uVP*vec4(w.x,w.y*uFlip,w.z,1.);}';

  var FS = '#version 300 es\nprecision highp float;precision highp sampler2DShadow;' +
    'in vec3 vPos,vNor,vObj;in vec2 vUV;in float vMat;in vec4 vL;' +
    'uniform sampler2DShadow uShadow;uniform vec3 uSun,uEye,uBg;uniform vec2 uRes;uniform float uHalf,uTexel,uFade,uPatch;out vec4 o;' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}' +
    'float lit(float bias){vec3 p=vL.xyz*.5+.5;if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)return 1.;' +
    'float s=0.;p.z-=bias;' +
    's+=texture(uShadow,p);' +
    's+=texture(uShadow,p+vec3(1.4,.6,0)*uTexel);s+=texture(uShadow,p+vec3(-.6,1.4,0)*uTexel);' +
    's+=texture(uShadow,p+vec3(-1.4,-.6,0)*uTexel);s+=texture(uShadow,p+vec3(.6,-1.4,0)*uTexel);' +
    's+=texture(uShadow,p+vec3(2.6,-1.2,0)*uTexel);s+=texture(uShadow,p+vec3(-1.2,-2.6,0)*uTexel);' +
    's+=texture(uShadow,p+vec3(-2.6,1.2,0)*uTexel);s+=texture(uShadow,p+vec3(1.2,2.6,0)*uTexel);return s/9.;}' +
    // the window the sun comes through: one tall opening with two mullions
    'float window(){vec2 m=vL.xy*uHalf;' +
    'float w=smoothstep(-5.3,-4.4,m.x)*(1.-smoothstep(4.3,5.4,m.x))*smoothstep(-3.6,-2.9,m.y)*(1.-smoothstep(3.3,4.3,m.y));' +
    'float bar=min(smoothstep(.05,.2,abs(m.x+1.9)),smoothstep(.05,.2,abs(m.x-1.75)));return w*mix(.25,1.,bar);}' +
    'void main(){vec3 v=normalize(uEye-vPos);vec3 n=normalize(vNor);if(dot(n,v)<0.)n=-n;int m=int(vMat+.5);' +
    'vec3 alb;float rough=.9;float thin=0.;' +
    'if(m==0){float st=abs(fract(vUV.x*36.+.5)-.5);float line=smoothstep(.0,.035,st);' +
    'float weave=noise(vUV*vec2(900.,160.))*.06+noise(vUV*vec2(40.,9.))*.08;' +
    'alb=vec3(.78,.66,.47)*(.86+weave)*mix(.82,1.,line);thin=1.;}' +
    'else if(m==1){float g=noise(vec2(vObj.y*46.,atan(vObj.z,vObj.x)*3.))*.5+noise(vObj.xz*30.)*.3;alb=vec3(.50,.33,.18)*(.72+.5*g);}' +
    'else if(m==2){float g=noise(vObj.xy*40.+vObj.z*17.);alb=vec3(.26,.17,.10)*(.75+.5*g);}' +
    'else if(m==3){alb=vec3(.42,.34,.22);}' +
    'else if(m==4){float pl=abs(fract(vObj.x*3.1)-.5);float gap=smoothstep(.0,.03,pl);float g=noise(vec2(vObj.x*3.1,vObj.z*.6)*vec2(7.,40.));' +
    'float id=hash(vec2(floor(vObj.x*3.1+.5),3.));alb=vec3(.46,.33,.20)*(.7+.25*id+.3*g)*mix(.45,1.,gap);}' +
    'else if(m==5){vec2 t=vPos.xz/1.5;vec2 f=abs(fract(t)-.5);float joint=smoothstep(.0,.012,min(f.x,f.y));' +
    'alb=vec3(.17,.155,.14)*(.9+.2*noise(vPos.xz*2.))*mix(.72,1.,joint);rough=.5;}' +
    'else{float c=noise(vPos.xy*vec2(1.3,5.))*.5+noise(vPos.xy*9.)*.25;vec2 f=abs(fract(vPos.xy/vec2(2.4,1.2))-.5);' +
    'float joint=smoothstep(.0,.006,min(f.x,f.y));alb=vec3(.31,.262,.215)*(.84+.22*c)*mix(.88,1.,joint);}' +
    'float ndl=dot(n,uSun);float bias=mix(.0045,.0012,clamp(abs(ndl),0.,1.));' +
    'float sh=lit(bias)*window();' +
    'vec3 sun=vec3(1.,.59,.29)*2.45;' +
    'vec3 col=alb*sun*max(ndl,0.)*sh;' +
    // linen lets the low sun through
    'col+=thin*alb*vec3(1.,.66,.34)*1.9*max(-ndl,0.)*sh;' +
    'vec3 sky=vec3(.085,.125,.26),bounce=vec3(.22,.14,.075);' +
    'float up=n.y*.5+.5;col+=alb*mix(bounce*(.35+.9*window()),sky,up)*.9;' +
    'vec3 h=normalize(uSun+v);float sp=pow(max(dot(n,h),0.),mix(90.,8.,rough))*(1.-rough)*1.4;col+=sun*sp*sh*.25;' +
    // filmic curve, then sRGB
    'col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);col=pow(clamp(col,0.,1.),vec3(1./2.2));' +
    // the hall falls away into the page: by distance on the ground, and toward the edges of the stage
    'float far=1.-smoothstep(5.5,15.,length(vPos.xz-vec2(uPatch,0.)));' +
    'if(m>=5)far*=1.-smoothstep(4.,11.,vPos.y);' +
    'vec2 e=gl_FragCoord.xy/uRes;float edge=smoothstep(0.,.14,e.y)*smoothstep(0.,.1,1.-e.y)*mix(1.,smoothstep(0.,.14,1.-e.x)*smoothstep(0.,.14,e.x),uFade);' +
    'float keep=m>=5?far*edge:1.;' +
    // the polished floor gives a little of the hall back, more at a flat angle
    'float a=1.;if(m==5){float fr=pow(1.-max(dot(n,v),0.),3.);a=1.-keep*mix(.07,.5,fr);}' +
    'o=vec4(mix(uBg,col,keep),a);}';

  var DVS = '#version 300 es\nlayout(location=0) in vec3 aPos;uniform mat4 uModel,uLight;void main(){gl_Position=uLight*uModel*vec4(aPos,1.);}';
  var DFS = '#version 300 es\nprecision mediump float;void main(){}';

  // a line is a thin quad between its two projected ends, so its width holds in screen pixels
  var LVS = '#version 300 es\n' +
    'layout(location=0) in vec3 aA;layout(location=1) in vec3 aB;layout(location=2) in float aT;layout(location=3) in float aS;layout(location=4) in float aK;' +
    'uniform mat4 uMVP;uniform vec2 uRes;uniform float uW;out float vK;' +
    'void main(){vec4 a=uMVP*vec4(aA,1.),b=uMVP*vec4(aB,1.);vec2 sa=a.xy/a.w*uRes,sb=b.xy/b.w*uRes;' +
    'vec2 d=sb-sa;float l=length(d);d=l>1e-4?d/l:vec2(1.,0.);vec2 n=vec2(-d.y,d.x);vec4 p=mix(a,b,aT);' +
    'float w=uW*(aK>.5?.62:1.);p.xy+=n*aS*w/uRes*p.w;vK=aK;gl_Position=p;}';
  var LFS = '#version 300 es\nprecision mediump float;in float vK;uniform vec3 uLine,uLine2;out vec4 o;' +
    'void main(){o=vK>.5?vec4(uLine2,.5):vec4(uLine,.9);}';

  function program(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  }
  function uniforms(gl, p, names) {
    var u = {}; names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); }); return u;
  }
  /* a page colour as the browser resolves it, so the model follows the page's variables */
  function srgb(css, fallback) {
    var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css || '');
    if (m) return [m[1] / 255, m[2] / 255, m[3] / 255];
    // a colour mixed by the style sheet comes back as color(srgb r g b), each from 0 to 1
    m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)/.exec(css || '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
  }
  function pageColour(stage, name, fallback) {
    var probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;color:var(' + name + ')';
    stage.appendChild(probe);
    var c = srgb(getComputedStyle(probe).color, fallback);
    stage.removeChild(probe);
    return c;
  }

  function mount(stage, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'stage__canvas';
    var gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'default' });
    if (!gl) return null;
    var main, depth, line, mesh;
    try { main = program(gl, VS, FS); depth = program(gl, DVS, DFS); line = program(gl, LVS, LFS); mesh = build(); }
    catch (err) { return null; }

    var um = uniforms(gl, main, ['uModel', 'uVP', 'uLight', 'uShadow', 'uSun', 'uEye', 'uBg', 'uRes', 'uHalf', 'uTexel', 'uFade', 'uFlip', 'uPatch']);
    var ud = uniforms(gl, depth, ['uModel', 'uLight']);
    var ul = uniforms(gl, line, ['uMVP', 'uRes', 'uW', 'uLine', 'uLine2']);

    var all = new Float32Array(mesh.still.length + mesh.spin.length);
    all.set(mesh.still, 0); all.set(mesh.spin, mesh.still.length);
    var nStill = mesh.still.length / 9, nSpin = mesh.spin.length / 9;
    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 1, 32]].forEach(function (a) {
      gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 36, a[2]);
    });

    var lines = new Float32Array(mesh.ls.length + mesh.lr.length);
    lines.set(mesh.ls, 0); lines.set(mesh.lr, mesh.ls.length);
    var nLs = mesh.ls.length / 9, nLr = mesh.lr.length / 9;
    var lvao = gl.createVertexArray(); gl.bindVertexArray(lvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 1, 24], [3, 1, 28], [4, 1, 32]].forEach(function (a) {
      gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 36, a[2]);
    });
    mesh = null;

    // the sun's own view, for the shadow
    var SM = (Math.min(window.devicePixelRatio || 1, 2) * stage.clientWidth > 900) ? 2048 : 1024;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // The sun stands low on the left, so the shadow falls on the wall to the right, clear of the lines.
    var toSun = norm([-0.5, 0.3, 0.81]);
    var HALF = 5.6, centre = [0.4, 2.7, -1.2];
    var lightEye = [centre[0] + toSun[0] * 20, centre[1] + toSun[1] * 20, centre[2] + toSun[2] * 20];
    var light = mul(ortho(HALF, 4, 40), lookAt(lightEye, centre, [0, 1, 0]));
    // The ground and the two line colours are the page's: the stage's background, --stage-line, --stage-line-2.
    var bg = srgb(getComputedStyle(stage).backgroundColor, [0.06, 0.07, 0.11]);
    var lineA = pageColour(stage, '--stage-line', [0.8, 0.52, 0.38]);
    var lineB = pageColour(stage, '--stage-line-2', [0.67, 0.69, 0.76]);

    var range = stage.querySelector('input[type=range]');
    var split = opts.split != null ? opts.split : (range ? Number(range.value) / 100 : 0.4);
    var angle = opts.angle != null ? opts.angle : 0.6, speed = 0, target = 0;
    var dirty = true, raf = 0, last = 0, drawn = -100, visible = true, held = false, w = 0, h = 0, dpr = 1, eye = [0, 0, 0], vp;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = stage.clientWidth, ch = stage.clientHeight;
      var scale = Math.min(1, Math.sqrt(2600000 / (cw * ch * dpr * dpr)));
      dpr *= scale;
      w = Math.max(2, Math.round(cw * dpr)); h = Math.max(2, Math.round(ch * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      // a phone stands closer: the screw fills the square
      var aspect = w / h, near = cw < 620;
      var fov = 2 * Math.atan(Math.tan(near ? 0.285 : 0.30) / Math.min(1, aspect * (near ? 1 : 0.92)));
      eye = near ? [2.0, 1.5, 13.0] : [2.4, 1.5, 14.0];
      vp = mul(perspective(fov, aspect, 0.5, 80), lookAt(eye, near ? [0.35, 2.78, 0] : [0.55, 2.72, 0], [0, 1, 0]));
      dirty = true;
    }

    function draw() {
      var model = rotY(angle), id = rotY(0), sx = Math.round(split * w);
      gl.bindVertexArray(vao);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, SM, SM);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depth);
      gl.uniformMatrix4fv(ud.uLight, false, light);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2);
      gl.uniformMatrix4fv(ud.uModel, false, id); gl.drawArrays(gl.TRIANGLES, 12, nStill - 12);
      gl.uniformMatrix4fv(ud.uModel, false, model); gl.drawArrays(gl.TRIANGLES, nStill, nSpin);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // right of the line: the built machine in the hall's light
      if (sx < w) {
        gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, 0, w - sx, h);
        gl.useProgram(main);
        gl.uniformMatrix4fv(um.uVP, false, vp);
        gl.uniformMatrix4fv(um.uLight, false, light);
        gl.uniform3fv(um.uSun, toSun); gl.uniform3fv(um.uEye, eye); gl.uniform3fv(um.uBg, bg);
        gl.uniform2f(um.uRes, w, h); gl.uniform1f(um.uHalf, HALF); gl.uniform1f(um.uTexel, 1 / SM); gl.uniform1f(um.uPatch, 1.2);
        gl.uniform1f(um.uFade, opts.fade != null ? opts.fade : (stage.clientWidth < window.innerWidth - 2 ? 1 : 0));
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(um.uShadow, 0);
        // 1. the hall upside down, 2. the floor over it, letting some of it through, 3. the hall itself
        gl.uniform1f(um.uFlip, -1);
        gl.uniformMatrix4fv(um.uModel, false, id); gl.drawArrays(gl.TRIANGLES, 6, nStill - 6);
        gl.uniformMatrix4fv(um.uModel, false, model); gl.drawArrays(gl.TRIANGLES, nStill, nSpin);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(um.uFlip, 1);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniformMatrix4fv(um.uModel, false, id); gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 6, nStill - 6);
        gl.uniformMatrix4fv(um.uModel, false, model); gl.drawArrays(gl.TRIANGLES, nStill, nSpin);
      }

      // left of the line: the same geometry as construction lines
      if (sx > 0) {
        gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, sx, h);
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(lvao);
        gl.useProgram(line);
        gl.uniform2f(ul.uRes, w, h); gl.uniform1f(ul.uW, 1.5 * dpr);
        gl.uniform3fv(ul.uLine, lineA); gl.uniform3fv(ul.uLine2, lineB);
        gl.uniformMatrix4fv(ul.uMVP, false, vp); gl.drawArrays(gl.TRIANGLES, 0, nLs);
        gl.uniformMatrix4fv(ul.uMVP, false, mul(vp, model)); gl.drawArrays(gl.TRIANGLES, nLs, nLr);
        gl.disable(gl.BLEND); gl.depthMask(true);
      }
      gl.disable(gl.SCISSOR_TEST);
    }

    function frame(t) {
      raf = 0;
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      if (!held) {
        speed += (target - speed) * Math.min(1, dt * 1.6);
        if (Math.abs(speed) > 0.0005) { angle += speed * dt; dirty = true; }
      }
      // a slow turn needs no more than thirty pictures a second: it spares a phone's battery
      if (dirty && (held || moving || t - drawn > 30)) {
        draw(); dirty = false; drawn = t; said();
        if (!stage.classList.contains('is-live')) stage.classList.add('is-live');
      }
      tick();
    }
    function tick() {
      if (raf || !visible || document.hidden) { if (!visible || document.hidden) last = 0; return; }
      if (dirty || held || Math.abs(target - speed) > 0.0005 || Math.abs(speed) > 0.0005) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function setSplit(v) {
      split = Math.min(1, Math.max(0, v));
      stage.style.setProperty('--split', (split * 100).toFixed(2) + '%');
      if (range) range.value = String(Math.round(split * 100));
      dirty = true; tick();
    }

    // by hand: near the dividing line a drag moves the line, anywhere else it turns the screw,
    // and the screw runs on a little when let go
    var px = 0, pt = 0, moving = false;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var r = canvas.getBoundingClientRect();
      moving = Math.abs((e.clientX - r.left) / r.width - split) * r.width < 24;
      if (!moving) { held = true; speed = 0; stage.classList.add('is-turned'); }
      px = e.clientX; pt = e.timeStamp;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      stage.classList.add('is-held'); tick();
    });
    canvas.addEventListener('pointermove', function (e) {
      var r;
      if (moving) { r = canvas.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); return; }
      if (!held) return;
      var dx = e.clientX - px, dtm = Math.max(1, e.timeStamp - pt);
      angle += dx * 0.0085; speed = speed * 0.6 + (dx * 0.0085) / (dtm / 1000) * 0.4;
      px = e.clientX; pt = e.timeStamp; dirty = true; tick();
    });
    function release() {
      if (!held && !moving) return;
      held = false; moving = false; speed = Math.max(-6, Math.min(6, speed));
      stage.classList.remove('is-held'); tick();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!step) return;
      e.preventDefault(); angle += step * Math.PI / 12; dirty = true; stage.classList.add('is-turned'); tick();
    });
    if (range) {
      range.disabled = false;
      range.addEventListener('input', function () { setSplit(Number(range.value) / 100); });
    }

    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', stage.dataset.label || '');
    canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '359');
    function said() {
      var deg = Math.round(((angle % TAU) + TAU) % TAU * 180 / Math.PI) % 360;
      canvas.setAttribute('aria-valuenow', String(deg));
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); stage.classList.remove('is-live'); if (raf) cancelAnimationFrame(raf); raf = 0; visible = false;
    });
    var after = stage.querySelector('picture');
    stage.insertBefore(canvas, after ? after.nextSibling : stage.firstChild);
    stage.style.setProperty('--split', (split * 100).toFixed(2) + '%');
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); tick(); }).observe(stage);
    else window.addEventListener('resize', function () { resize(); tick(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; tick(); }, { rootMargin: '80px' }).observe(stage);
    }
    document.addEventListener('visibilitychange', tick);
    tick();

    return {
      turning: function (on) { target = on ? SPEED : 0; tick(); },
      setAngle: function (a) { angle = a; dirty = true; tick(); },
      setSplit: setSplit,
      canvas: canvas
    };
  }

  /* A piece registers under the name the wing's data gives it. */
  window.MoaPieces = window.MoaPieces || {};
  window.MoaPieces['aerial-screw'] = { mount: mount };
})();
