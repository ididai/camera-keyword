export function buildSubjectObject(THREE, type, scene) {
  const group = new THREE.Group();

  if (type === "person") {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8d5e0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0xf19eb8 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const shoes = new THREE.MeshLambertMaterial({ color: 0x0d0d1a });
    const eye = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); group.add(m);
    };
    add(new THREE.BoxGeometry(0.28,0.12,0.4), shoes, -0.15,-0.88,0.05);
    add(new THREE.BoxGeometry(0.28,0.12,0.4), shoes,  0.15,-0.88,0.05);
    add(new THREE.CylinderGeometry(0.11,0.10,0.65,8), pants, -0.15,-0.57,0);
    add(new THREE.CylinderGeometry(0.11,0.10,0.65,8), pants,  0.15,-0.57,0);
    add(new THREE.BoxGeometry(0.52,0.38,0.26), pants, 0,-0.18,0);
    add(new THREE.BoxGeometry(0.64,0.55,0.28), shirt, 0, 0.22,0);
    add(new THREE.CylinderGeometry(0.08,0.07,0.48,8), shirt, -0.40,-0.02,0);
    add(new THREE.CylinderGeometry(0.08,0.07,0.48,8), shirt,  0.40,-0.02,0);
    add(new THREE.CylinderGeometry(0.07,0.08,0.16,8), skin, 0, 0.56,0);
    const head = new THREE.Group(); head.position.set(0,0.82,0); group.add(head);
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22,14,12), skin);
    head.add(headSphere);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6), eye); eyeL.position.set(-0.08,0.03,0.20); head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03,6,6), eye); eyeR.position.set( 0.08,0.03,0.20); head.add(eyeR);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025,0.07,6), skin); nose.rotation.x=Math.PI/2; nose.position.set(0,-0.02,0.22); head.add(nose);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.225,14,8,0,Math.PI*2,0,Math.PI*0.5), hair);
    hairTop.position.set(0, 0.05, -0.01);
    head.add(hairTop);
  }

  else if (type === "building") {
    // 실내 방 — 3면 열린 코너뷰 (CCTV/광각 인테리어)
    const dbl  = 2; // DoubleSide
    const wMat = new THREE.MeshLambertMaterial({ color: 0xeee8d8, side: dbl });
    const fMat = new THREE.MeshLambertMaterial({ color: 0xc8b490, side: dbl });
    const cMat = new THREE.MeshLambertMaterial({ color: 0xf4f0e4, side: dbl });
    const winMat = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent:true, opacity:0.45, side:dbl });
    const sofaM  = new THREE.MeshLambertMaterial({ color: 0x5a6e82 });
    const tableM = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const rugM   = new THREE.MeshLambertMaterial({ color: 0xaa7755, side:dbl });

    const W=2.4, H=1.8, D=2.4;
    const add = (geo,mat,x,y,z,rx=0,ry=0) => {
      const m=new THREE.Mesh(geo,mat);
      m.position.set(x,y,z);
      if(rx) m.rotation.x=rx;
      if(ry) m.rotation.y=ry;
      group.add(m);
    };

    // 바닥
    add(new THREE.PlaneGeometry(W,D), fMat, 0,-H/2,0, -Math.PI/2);
    // 천장
    add(new THREE.PlaneGeometry(W,D), cMat, 0,H/2,0, Math.PI/2);
    // 뒷벽 (Z-)
    add(new THREE.PlaneGeometry(W,H), wMat, 0,0,-D/2);
    // 왼쪽벽 (X-)
    add(new THREE.PlaneGeometry(D,H), wMat, -W/2,0,0, 0,Math.PI/2);
    // 오른쪽벽 창문 — 위아래 두 패널 + 창문
    add(new THREE.PlaneGeometry(D, H*0.28), wMat,  W/2, H*0.36, 0, 0,-Math.PI/2);
    add(new THREE.PlaneGeometry(D, H*0.28), wMat,  W/2,-H*0.36, 0, 0,-Math.PI/2);
    add(new THREE.PlaneGeometry(D*0.6, H*0.36), winMat, W/2, 0, 0, 0,-Math.PI/2);

    // 바닥 러그
    add(new THREE.PlaneGeometry(1.0,0.7), rugM, -0.1,-H/2+0.01,0.2, -Math.PI/2);

    // 소파 (뒷벽 앞)
    add(new THREE.BoxGeometry(1.1,0.22,0.44), sofaM, -0.1,-H/2+0.14,-D/2+0.32);
    add(new THREE.BoxGeometry(1.1,0.38,0.12), sofaM, -0.1,-H/2+0.22,-D/2+0.12);
    add(new THREE.BoxGeometry(0.14,0.38,0.44), sofaM, -0.68,-H/2+0.22,-D/2+0.32);
    add(new THREE.BoxGeometry(0.14,0.38,0.44), sofaM,  0.48,-H/2+0.22,-D/2+0.32);
    // 쿠션
    add(new THREE.BoxGeometry(0.22,0.18,0.10),
      new THREE.MeshLambertMaterial({color:0xddbbaa}),
      -0.3,-H/2+0.30,-D/2+0.20);

    // 커피테이블
    add(new THREE.BoxGeometry(0.55,0.05,0.32), tableM,  -0.1,-H/2+0.22, 0.16);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,  -0.32,-H/2+0.11, 0.04);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,   0.12,-H/2+0.11, 0.04);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,  -0.32,-H/2+0.11, 0.28);
    add(new THREE.BoxGeometry(0.04,0.22,0.04), tableM,   0.12,-H/2+0.11, 0.28);

    // 천장 조명
    add(new THREE.CylinderGeometry(0.14,0.11,0.06,12),
      new THREE.MeshLambertMaterial({color:0xffffee, emissive:0xffffcc, emissiveIntensity:0.5}),
      0.1,H/2-0.05,-0.15);
  }

  else if (type === "cosmetic") {
    // 화장품 보틀 — 유리 같은 반투명 용기 + 골드 캡
    const glass   = new THREE.MeshLambertMaterial({ color: 0xe8e0f0, transparent: true, opacity: 0.82 });
    const glassDk = new THREE.MeshLambertMaterial({ color: 0xc8b8e0, transparent: true, opacity: 0.9 });
    const cap     = new THREE.MeshLambertMaterial({ color: 0xd4a847 }); // 골드 캡
    const capDk   = new THREE.MeshLambertMaterial({ color: 0xa07820 });
    const label   = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const labelTx = new THREE.MeshLambertMaterial({ color: 0x8866aa }); // 라벨 텍스트 컬러
    const base    = new THREE.MeshLambertMaterial({ color: 0x1a1a2a }); // 바닥 면
    const pump    = new THREE.MeshLambertMaterial({ color: 0xc0a030 }); // 펌프 헤드

    const add = (geo, mat, x, y, z, rx=0, ry=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      m.castShadow = true;
      group.add(m);
      return m;
    };

    // ── 보틀 바디 (아래가 넓고 위로 갈수록 살짝 좁아지는 형태) ──
    add(new THREE.CylinderGeometry(0.28, 0.32, 1.10, 24), glass,   0,  0,     0);
    // 바디 하이라이트 (앞면 반사)
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.90, 8), glassDk,  0.18, 0, 0.22);

    // ── 보틀 바닥 ──
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24), base, 0, -0.57, 0);

    // ── 라벨 (앞면 중앙) ──
    add(new THREE.CylinderGeometry(0.285, 0.315, 0.55, 24, 1, false, -0.6, 1.2), label, 0, -0.05, 0);
    // 라벨 텍스트 라인 (세 줄)
    add(new THREE.BoxGeometry(0.30, 0.025, 0.04), labelTx, 0,  0.08, 0.29);
    add(new THREE.BoxGeometry(0.20, 0.018, 0.04), labelTx, 0, -0.01, 0.29);
    add(new THREE.BoxGeometry(0.24, 0.018, 0.04), labelTx, 0, -0.09, 0.29);

    // ── 넥 (보틀 목) ──
    add(new THREE.CylinderGeometry(0.14, 0.26, 0.22, 20), glass, 0, 0.66, 0);

    // ── 골드 캡 링 ──
    add(new THREE.CylinderGeometry(0.155, 0.155, 0.06, 20), cap, 0, 0.80, 0);

    // ── 펌프 헤드 & 스템 ──
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 16), capDk, 0, 0.95, 0); // 펌프 바디
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),  pump,  0, 1.21, 0); // 스템
    // 펌프 헤드 (꺾인 노즐)
    const head = add(new THREE.CylinderGeometry(0.06, 0.06, 0.10, 12), cap,  0.08, 1.45, 0);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), pump, 0.14, 1.45, 0); // 노즐
  }

  else if (type === "terrain") {
    const grass = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    const rock  = new THREE.MeshLambertMaterial({ color: 0x888878 });
    const water = new THREE.MeshLambertMaterial({ color: 0x3a6aaa, transparent:true, opacity:0.8 });
    const snow  = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const add = (geo,mat,x,y,z) => { const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); group.add(m); };
    add(new THREE.CylinderGeometry(0.9,1.0,0.2,12), grass, 0,-0.5,0);
    add(new THREE.ConeGeometry(0.45,0.9,8), rock, -0.2,0.05,0);
    add(new THREE.ConeGeometry(0.30,0.65,8), rock,  0.25,0.0,0.1);
    add(new THREE.SphereGeometry(0.12,8,6), snow, -0.2,0.52,0);
    add(new THREE.SphereGeometry(0.08,8,6), snow,  0.25,0.38,0.1);
    add(new THREE.CylinderGeometry(0.3,0.32,0.06,12), water, 0.3,-0.42,-0.3);
  }


  scene.add(group);
  return group;
}
