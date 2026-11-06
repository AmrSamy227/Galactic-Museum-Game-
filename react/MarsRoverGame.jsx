import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import './MarsRoverGame.css';

/**
 * AFTERLIGHT: Mars & Moon Rover — React Educational Component
 * With Full Mobile Touch Controls & Responsive HUD
 * 
 * Props:
 * @param {'mars' | 'moon'} [initialWorld='mars'] - Initial planetary environment
 * @param {number} [initialMission=0] - Initial mission index (0 - 3)
 * @param {boolean} [showBuiltInUI=true] - Render built-in tactical HUD and dialogs
 * @param {number} [volume=0.6] - Initial audio volume (0.0 to 1.0)
 * @param {boolean} [soundEnabled=true] - Master audio toggle
 * @param {Function} [onMissionComplete] - Callback({ mission, score, accuracy, time, knowledgeCount })
 * @param {Function} [onFactDiscovered] - Callback({ title, content })
 * @param {Function} [onTelemetryUpdate] - Callback({ speed, health, sprintEnergy, heading, odometer })
 * @param {string} [assetBasePath='/assets'] - Base path for texture assets
 */
export default function MarsRoverGame({
  initialWorld = 'mars',
  initialMission = 0,
  showBuiltInUI = true,
  volume = 0.6,
  soundEnabled = true,
  onMissionComplete,
  onFactDiscovered,
  onTelemetryUpdate,
  assetBasePath = 'assets',
  className = '',
  style = {}
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const minimapCanvasRef = useRef(null);
  const joystickKnobRef = useRef(null);
  const joystickBaseRef = useRef(null);
  const gameRef = useRef(null);

  // Virtual touch input ref for 60fps performance without React re-render lag
  const touchInputRef = useRef({
    forward: 0,
    steer: 0,
    brake: false,
    sprint: false
  });

  // React state mirrors
  const [worldState, setWorldState] = useState(initialWorld);
  const [speedDisplay, setSpeedDisplay] = useState('0.0');
  const [sprintEnergy, setSprintEnergy] = useState(100);
  const [roverHealth, setRoverHealth] = useState(100);
  const [currentObjective, setCurrentObjective] = useState('');
  const [objectiveProgress, setObjectiveProgress] = useState(0);
  const [compassHeading, setCompassHeading] = useState('N 0°');
  const [targetDistanceText, setTargetDistanceText] = useState('STANDBY');
  const [isPaused, setIsPaused] = useState(false);
  const [cameraModeName, setCameraModeName] = useState('ORBIT');
  const [activeCard, setActiveCard] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [missionCompleteData, setMissionCompleteData] = useState(null);
  const [isNearTarget, setIsNearTarget] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (gameRef.current && gameRef.current.setWorld) {
      gameRef.current.setWorld(initialWorld);
      setWorldState(initialWorld);
    }
  }, [initialWorld]);

  useEffect(() => {
    if (gameRef.current && gameRef.current.setVolume) {
      gameRef.current.setVolume(soundEnabled ? volume : 0);
    }
  }, [volume, soundEnabled]);

  // Initialize and mount 3D simulation
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const mmCanvas = minimapCanvasRef.current;

    const hash = (x, y) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    function vn(x, y) {
      const i = Math.floor(x), j = Math.floor(y);
      const fx = x - i, fy = y - j;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return hash(i, j) * (1 - u) * (1 - v) +
             hash(i + 1, j) * u * (1 - v) +
             hash(i, j + 1) * (1 - u) * v +
             hash(i + 1, j + 1) * u * v;
    }
    function fbm(x, y, oct = 4) {
      let val = 0, amp = 0.5, freq = 1;
      for (let i = 0; i < oct; i++) {
        val += vn(x * freq, y * freq) * amp;
        freq *= 2.05;
        amp *= 0.5;
      }
      return val;
    }

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const MISSIONS = [
      {
        n: '01 FIRST CONTACT',
        s: [0, 0],
        steps: [
          { t: 'Activate drive systems: Push joystick UP or press W to move', k: 'move' },
          { t: 'Engage Overdrive Sprint: Tap or Hold SPRINT to surge forward', k: 'sprint' },
          { t: 'Steer left past the survey beacon', p: [[-16, 36]] },
          { t: 'Weave right around the boulder cluster', p: [[8, 56]] },
          { t: 'Reach Checkpoint Alpha at the plateau base', p: [[0, 78]] }
        ],
        cards: {
          0: ['Six Wheels & Rocker-Bogie Suspension', 'NASA\'s Sojourner used an articulated rocker-bogie mechanism with no springs. This allows the rover to climb obstacles twice its wheel diameter while keeping all six cleated wheels grounded.'],
          1: ['Solar Overdrive & Battery Management', 'Rovers rely on solar array decks. Overdrive delivers bursts of peak battery current to hub motors for traversing loose dunes, but demands cooling between surges.'],
          4: ['Deliberate Speed on Distant Worlds', 'On Mars, radio signals take 5 to 20 minutes to reach Earth. Sojourner moved at ~1 cm/second to allow autonomous hazard avoidance without tipping over.']
        }
      },
      {
        n: '02 THE ROCKY PATH',
        s: [0, 78],
        steps: [
          { t: 'Advance toward the ancient geological escarpment', p: [[36, 110]] },
          { t: 'Carefully skirt the rim of the impact crater', p: [[72, 145]] },
          { t: 'Sprint across the rocky dune valley (Hold SPRINT)', p: [[95, 180]] },
          { t: 'Reach Exploration Outpost Bravo', p: [[75, 215]] }
        ],
        cards: {
          0: ['Route Planning from Orbit', 'Before sending drive sequences, JPL navigators analyze high-resolution orbital satellite photography to chart safe paths around treacherous rock gardens.'],
          2: ['Impact Craters as Windows to the Past', 'Craters expose deep bedrock layers ejected by meteorite impacts, giving rovers access to billions of years of planetary history without drilling.']
        }
      },
      {
        n: '03 SCIENTIFIC DISCOVERY',
        s: [75, 215],
        steps: [
          { t: 'Navigate to the glowing scientific anomaly site', p: [[26, 240]] },
          { t: 'Carefully approach the giant target rock formation', p: [[-10, 252]] },
          { t: 'Stop inside the scan circle and tap SCAN to deploy APXS', k: 'insp' }
        ],
        cards: {
          0: ['Deep Space Network Relay', 'Sojourner communicated with the Pathfinder lander base station via UHF radio, which relayed scientific telemetry to NASA\'s worldwide Deep Space Network antenna dishes.'],
          2: ['Alpha Proton X-Ray Spectrometer (APXS)', 'The APXS sensor contains Curium-244 radioactive alpha sources. When pressed against Martian rocks, it reveals essential elements like Silicon, Iron, Magnesium, and Aluminum.']
        }
      },
      {
        n: '04 THE LOST SIGNAL',
        s: [-10, 252],
        steps: [
          { t: 'Track the faint distress beacon signal west', p: [[-56, 234]] },
          { t: 'Choose your route: North rocky ridge or South sand flats', p: [[-102, 212], [-92, 172]] },
          { t: 'Sprint past high-risk seismic hazard terrain (Hold SPRINT)', p: [[-140, 146]] },
          { t: 'Reach the abandoned exploration station', p: [[-160, 80]] }
        ],
        cards: {
          0: ['Autonomous Hazard Avoidance', 'Equipped with front-facing stereo laser stripe projectors and Hazcams, NASA rovers can independently stop if a drop-off or impassable boulder is detected.']
        }
      }
    ];

    const MOONCARDS = [
      ['Oceanus Procellarum: The Ocean of Storms', 'The vast dark volcanic plain was formed over 3 billion years ago by ancient flood basalt eruptions. With no atmosphere to scatter light, the sky remains pitch-black even at high noon.'],
      ['Lunar Opposition Surge (Heiligenschein)', 'Notice how the ground brightens around your shadow! The porous microscopic structure of lunar regolith retroreflects sunlight directly back at the source, creating a radiant halo effect celebrated by Apollo astronauts.'],
      ['Lunar Dust Fountains & Electrostatic Weather', 'The Moon has no rain or wind, but it does have weather: solar UV radiation knocks electrons from surface dust, charging particles so they levitate meters into the vacuum sky at the terminator line.'],
      ['Apollo Legacy: The Descent Stage', 'Left behind when astronauts returned to orbit, the gold-foil insulated Apollo Lunar Module descent stages remain permanently preserved on the Moon, completely unchanged after more than half a century.']
    ];

    const WORLD_CONFIG = {
      mars: {
        fog: 0xb98864,
        skyTop: 0x3d2c22,
        skyHor: 0xd49b74,
        sun: 0xffedd6,
        sunIntensity: 2.2,
        ambient: 0x8a5438,
        gravity: 1.0,
        dustColor: 0xd98d62
      },
      moon: {
        fog: 0x000000,
        skyTop: 0x000000,
        skyHor: 0x000000,
        sun: 0xffffff,
        sunIntensity: 3.8,
        ambient: 0x141a24,
        gravity: 0.45,
        dustColor: 0xc8c8c8
      }
    };

    const CRATERS = [
      [45, 125, 18, 3.2],
      [-65, 100, 26, 4.2],
      [125, 60, 30, 4.8],
      [-105, 175, 22, 3.5],
      [155, 205, 36, 5.5],
      [25, -60, 24, 3.8],
      [-25, 150, 16, 2.5]
    ];

    let currentWorld = initialWorld;
    let currentMi = initialMission;

    function getTerrainHeight(x, z) {
      const isMoon = (currentWorld === 'moon');
      const scale = isMoon ? 1.35 : 1.0;
      let h = (vn(x * 0.011, z * 0.011) - 0.5) * 17 * scale +
              (vn(x * 0.038, z * 0.038) - 0.5) * 4.2 +
              (vn(x * 0.14, z * 0.14) - 0.5) * 0.9 +
              (vn(x * 0.55, z * 0.55) - 0.5) * 0.15;
      for (const [cx, cz, cr, cdepth] of CRATERS) {
        const dist = Math.hypot(x - cx, z - cz);
        const q = dist / cr;
        if (q < 1.4) {
          if (q < 1.0) {
            const bowl = -cdepth * (1 - q * q) * (1 - q * q * 0.28);
            const centralPeak = (q < 0.24) ? cdepth * 0.42 * (1 - q / 0.24) : 0;
            h += bowl + centralPeak;
          } else {
            h += cdepth * 0.26 * Math.max(0, 1 - (q - 1.0) * 3.2);
          }
        }
      }
      return h * (1 - Math.exp(-(Math.hypot(x, z) ** 2) / 80));
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1200);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    onResize();

    function createNoiseTexture(size = 512, scale = 140) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d');
      const imgData = ctx.createImageData(size, size);
      const d = imgData.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const n = fbm(x / 32, y / 32, 4);
          const grain = (hash(x * 0.7, y * 0.9) - 0.5) * 45;
          const val = clamp(n * 220 + grain, 0, 255);
          d[idx] = d[idx + 1] = d[idx + 2] = val;
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(scale, scale);
      return tex;
    }
    const NOISE_TEX = createNoiseTexture(512, 140);

    const textureLoader = new THREE.TextureLoader();
    function loadTexture(url, fallbackFn, repeat = 1) {
      if (!url) return fallbackFn();
      const tex = textureLoader.load(
        url,
        () => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeat, repeat);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 8;
        },
        undefined,
        () => console.warn('Using procedural fallback for:', url)
      );
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    function createProceduralMoonTexture() {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1024;
      const ctx = cv.getContext('2d');
      const imgData = ctx.createImageData(1024, 1024);
      const d = imgData.data;
      for (let y = 0; y < 1024; y++) {
        for (let x = 0; x < 1024; x++) {
          const idx = (y * 1024 + x) * 4;
          const n1 = fbm(x / 90, y / 90, 5);
          const n2 = fbm(x / 25, y / 25, 4);
          const microCraters = Math.pow(clamp(vn(x * 0.08, y * 0.08), 0, 1), 5.0) * 80;
          const gray = clamp(115 + n1 * 80 + n2 * 40 - microCraters + (hash(x, y) - 0.5) * 30, 45, 235);
          d[idx] = gray;
          d[idx + 1] = gray + 1;
          d[idx + 2] = gray + 4;
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(24, 24);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    function createProceduralMarsTexture() {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1024;
      const ctx = cv.getContext('2d');
      const imgData = ctx.createImageData(1024, 1024);
      const d = imgData.data;
      for (let y = 0; y < 1024; y++) {
        for (let x = 0; x < 1024; x++) {
          const idx = (y * 1024 + x) * 4;
          const n1 = fbm(x / 120, y / 120, 5);
          const n2 = fbm(x / 35, y / 35, 4);
          const combined = clamp(n1 * 0.65 + n2 * 0.35, 0, 1);
          d[idx] = clamp(185 + combined * 65 + (hash(x, y) - 0.5) * 20, 110, 255);
          d[idx + 1] = clamp(75 + combined * 60 + (hash(x * 2, y) - 0.5) * 15, 45, 175);
          d[idx + 2] = clamp(40 + combined * 45, 20, 110);
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    const rover = {
      group: new THREE.Group(),
      wheels: [],
      steerNodes: [],
      wheelPoints: [
        [-0.62, 0.0, 0.0],
        [ 0.62, 0.0, 0.0],
        [-0.62, 0.0, 0.78],
        [ 0.62, 0.0, 0.78],
        [-0.62, 0.0, -0.78],
        [ 0.62, 0.0, -0.78]
      ],
      x: 0, z: 0, y: 0,
      yaw: 0, pitch: 0, roll: 0,
      v: 0, steer: 0, odometer: 0,
      sprintEnergy: 100,
      isSprinting: false
    };

    (function buildRover() {
      const g = rover.group;
      const pbr = (col, rough = 0.5, metal = 0.5) => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal });
      
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 1.45), pbr(0xba943a, 0.35, 0.85));
      chassis.position.y = 0.72;
      chassis.castShadow = true;
      g.add(chassis);

      const solarDeck = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.03, 1.52), pbr(0x101a36, 0.25, 0.3));
      solarDeck.position.y = 0.99;
      solarDeck.castShadow = true;
      g.add(solarDeck);

      const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.55), pbr(0xcccccc, 0.3, 0.9));
      mastPole.position.set(-0.35, 1.25, 0.45);
      g.add(mastPole);
      const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.12), pbr(0x1a2430, 0.4, 0.7));
      camHead.position.set(-0.35, 1.52, 0.45);
      g.add(camHead);

      rover.wheelPoints.forEach((pt, index) => {
        const assembly = new THREE.Group();
        assembly.position.set(pt[0], 0.26, pt[2]);
        const steerGroup = new THREE.Group();
        assembly.add(steerGroup);
        if (index >= 2) rover.steerNodes.push({ group: steerGroup, isFront: index < 4 });

        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.24, 18), pbr(0x2a2e34, 0.8, 0.3));
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        steerGroup.add(tire);
        g.add(assembly);
        rover.wheels.push({ assembly, tire });
      });
    })();

    const keys = {};
    const onKeyDown = e => {
      keys[e.code] = true;
      if (e.code === 'KeyC') {
        camViewIndex = (camViewIndex + 1) % 3;
        const modes = ['ORBIT', 'CLOSE', 'MASTCAM'];
        setCameraModeName(modes[camViewIndex]);
      }
      if (e.code === 'KeyR') resetPosition();
      if (e.code === 'KeyE') checkInspection();
    };
    const onKeyUp = e => { keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let isDragging = false;
    let orbitYaw = 0, orbitPitch = 0.32, camDist = 9.0, camViewIndex = 0;

    const onPointerDown = e => { if (e.pointerType === 'mouse' && e.button === 0) isDragging = true; };
    const onPointerUp = e => { if (e.pointerType === 'mouse') isDragging = false; };
    const onPointerMove = e => {
      if (isDragging && e.pointerType === 'mouse') {
        orbitYaw -= e.movementX * 0.0055;
        orbitPitch = clamp(orbitPitch + e.movementY * 0.0035, 0.05, 1.25);
      }
    };
    const onWheel = e => {
      camDist = clamp(camDist + e.deltaY * 0.012, 3.2, 24.0);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });

    // Touch Camera Orbit on Canvas
    let touchStartPos = { x: 0, y: 0 };
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartPos.x;
        const dy = e.touches[0].clientY - touchStartPos.y;
        orbitYaw -= dx * 0.0065;
        orbitPitch = clamp(orbitPitch + dy * 0.004, 0.05, 1.25);
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    let audioCtx = null, motorOsc = null, motorGain = null;
    function initAudio() {
      if (audioCtx) return;
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioClass();
        motorOsc = audioCtx.createOscillator();
        motorOsc.type = 'sawtooth';
        motorOsc.frequency.value = 38;
        motorGain = audioCtx.createGain();
        motorGain.gain.value = 0;
        motorOsc.connect(motorGain).connect(audioCtx.destination);
        motorOsc.start();
      } catch (e) {}
    }
    const onFirstUserClick = () => {
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      window.removeEventListener('click', onFirstUserClick);
      window.removeEventListener('touchstart', onFirstUserClick);
    };
    window.addEventListener('click', onFirstUserClick);
    window.addEventListener('touchstart', onFirstUserClick);

    let worldGroup = null;
    let rockColliders = [];
    let sunLight = null;
    let targetMesh = null;
    let beaconMesh = null, beaconRing = null;
    let stepIdx = 0;
    let activeTarget = null;
    let impactCount = 0;
    let roverDamage = 0;

    function buildWorld(targetWorld) {
      if (worldGroup) scene.remove(worldGroup);
      worldGroup = new THREE.Group();
      scene.add(worldGroup);
      rockColliders = [];

      currentWorld = targetWorld;
      const cfg = WORLD_CONFIG[currentWorld];
      const isMoon = (currentWorld === 'moon');

      scene.fog = isMoon ? null : new THREE.FogExp2(cfg.fog, 0.0055);
      scene.background = new THREE.Color(cfg.skyHor);

      worldGroup.add(new THREE.HemisphereLight(isMoon ? 0x182436 : 0xffddc4, cfg.ambient, isMoon ? 0.38 : 0.85));

      sunLight = new THREE.DirectionalLight(cfg.sun, cfg.sunIntensity);
      sunLight.position.set(-85, 65, -45);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      worldGroup.add(sunLight, sunLight.target);

      if (isMoon) {
        const starCoords = [];
        for (let i = 0; i < 3000; i++) {
          const u = Math.random() * Math.PI * 2;
          const v = Math.random() * 1.55 + 0.02;
          starCoords.push(Math.cos(u) * Math.cos(v) * 750, Math.sin(v) * 750, Math.sin(u) * Math.cos(v) * 750);
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
        worldGroup.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 1.8, color: 0xffffff, fog: false })));

        const earth = new THREE.Mesh(new THREE.SphereGeometry(36, 32, 24), new THREE.MeshStandardMaterial({ color: 0x2262a8, roughness: 0.6 }));
        earth.position.set(280, 360, 400);
        worldGroup.add(earth);
      }

      const tGeo = new THREE.PlaneGeometry(450, 450, 200, 200);
      tGeo.rotateX(-Math.PI / 2);
      const pos = tGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)));
      }
      tGeo.computeVertexNormals();

      const terrainTex = isMoon ?
        loadTexture(`${assetBasePath}/textures/moon_surface.avif`, createProceduralMoonTexture, 24) :
        loadTexture(`${assetBasePath}/textures/mars_surface.jpg`, createProceduralMarsTexture, 18);

      const tMat = new THREE.MeshStandardMaterial({
        map: terrainTex,
        bumpMap: NOISE_TEX,
        bumpScale: isMoon ? 1.6 : 1.3,
        roughness: 0.95,
        color: isMoon ? 0xd2d2d8 : 0xffffff
      });
      const tMesh = new THREE.Mesh(tGeo, tMat);
      tMesh.receiveShadow = true;
      worldGroup.add(tMesh);

      const rockGeo = new THREE.IcosahedronGeometry(1, 2);
      const rockMat = new THREE.MeshStandardMaterial({ bumpMap: NOISE_TEX, bumpScale: 1.5, roughness: 0.9, color: isMoon ? 0xaaaaaa : 0xd8b59e });
      let seed = 42;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 150; i++) {
        const rx = (rnd() - 0.5) * 340;
        const rz = (rnd() - 0.5) * 340;
        const rad = 1.2 + rnd() * 2.2;
        const rk = new THREE.Mesh(rockGeo, rockMat);
        rk.scale.set(rad, rad * 0.8, rad);
        rk.position.set(rx, getTerrainHeight(rx, rz) + rad * 0.3, rz);
        rk.castShadow = true;
        rk.receiveShadow = true;
        worldGroup.add(rk);
        rockColliders.push({ x: rx, z: rz, r: rad * 0.9 });
      }

      targetMesh = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: isMoon ? 0xffffff : 0xffccaa, emissive: isMoon ? 0x112233 : 0x4a1808 }));
      targetMesh.scale.set(2.2, 1.8, 2.2);
      targetMesh.position.set(-10, getTerrainHeight(-10, 252) + 0.6, 252);
      targetMesh.userData = { name: isMoon ? 'ANORTHOSITE HIGHLAND BRECCIA' : 'YOGI ROCK' };
      worldGroup.add(targetMesh);
      rockColliders.push({ x: -10, z: 252, r: 2.2 });

      beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 50, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x69c9f2, transparent: true, opacity: 0.4, depthWrite: false }));
      beaconRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.14, 12, 48), new THREE.MeshBasicMaterial({ color: 0x69c9f2 }));
      beaconRing.rotation.x = Math.PI / 2;
      worldGroup.add(beaconMesh, beaconRing);

      worldGroup.add(rover.group);

      const m = MISSIONS[currentMi];
      rover.x = m.s[0];
      rover.z = m.s[1];
      rover.y = getTerrainHeight(rover.x, rover.z);
      rover.v = 0;
      stepIdx = 0;
      setCurrentObjective(m.steps[0].t);
      setObjectiveProgress(0);

      const card = isMoon ? MOONCARDS[0] : m.cards[0];
      if (card) {
        setActiveCard({ title: card[0], content: card[1] });
        if (onFactDiscovered) onFactDiscovered({ title: card[0], content: card[1] });
      }
    }

    function resetPosition() {
      const m = MISSIONS[currentMi];
      rover.x = m.s[0];
      rover.z = m.s[1];
      rover.v = 0;
      rover.pitch = rover.roll = 0;
      rover.y = getTerrainHeight(rover.x, rover.z);
    }

    function checkInspection() {
      if (targetMesh && Math.hypot(rover.x - targetMesh.position.x, rover.z - targetMesh.position.z) < 7.0) {
        setInspectionTarget(targetMesh.userData.name);
      }
    }

    buildWorld(initialWorld);

    const clock = new THREE.Clock();
    let animId = null;

    function loop() {
      animId = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (!isPaused && worldGroup) {
        const touch = touchInputRef.current;
        const keyFwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        const keySteer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);

        const fwd = clamp(keyFwd + touch.forward, -1, 1);
        const steer = clamp(keySteer + touch.steer, -1, 1);
        const sprint = (keys.ShiftLeft || keys.ShiftRight || touch.sprint) && fwd > 0 && rover.sprintEnergy > 10;
        const brake = keys.Space || touch.brake;

        rover.isSprinting = sprint;
        if (sprint) {
          rover.sprintEnergy = Math.max(0, rover.sprintEnergy - dt * 22);
        } else {
          rover.sprintEnergy = Math.min(100, rover.sprintEnergy + dt * 14);
        }
        setSprintEnergy(Math.round(rover.sprintEnergy));

        // Proximity for SCAN button
        if (targetMesh) {
          const dToRock = Math.hypot(rover.x - targetMesh.position.x, rover.z - targetMesh.position.z);
          setIsNearTarget(dToRock < 7.0);
        }

        const maxSpd = (fwd < 0 ? 2.2 : 3.8) * (sprint ? 1.95 : 1.0) * (1 - clamp(roverDamage / 160, 0, 0.45));
        let accel = fwd ? fwd * (sprint ? 4.8 : 2.5) : (brake ? -Math.sign(rover.v) * 7.5 : -Math.sign(rover.v) * 1.5);
        accel -= Math.sin(rover.pitch) * 5.0 * WORLD_CONFIG[currentWorld].gravity;
        rover.v = clamp(rover.v + accel * dt, -2.4, maxSpd);
        if (fwd === 0 && !brake && Math.abs(rover.v) < 0.08) rover.v = 0;

        rover.steer += (steer - rover.steer) * Math.min(1, dt * 4.2);
        rover.steerNodes.forEach(sn => { sn.group.rotation.y = sn.isFront ? rover.steer * 0.48 : -rover.steer * 0.24; });

        rover.yaw += rover.steer * (0.55 + 0.45 * Math.min(1, Math.abs(rover.v) / 1.5)) * dt * (fwd < 0 ? -1 : 1);
        rover.x += Math.sin(rover.yaw) * rover.v * dt;
        rover.z += Math.cos(rover.yaw) * rover.v * dt;

        for (const rk of rockColliders) {
          const dx = rover.x - rk.x, dz = rover.z - rk.z;
          const dist = Math.hypot(dx, dz);
          if (dist < rk.r + 0.95 && dist > 0.001) {
            rover.x = rk.x + (dx / dist) * (rk.r + 0.95);
            rover.z = rk.z + (dz / dist) * (rk.r + 0.95);
            if (Math.abs(rover.v) > 0.8) {
              impactCount++;
              roverDamage = Math.min(100, roverDamage + Math.abs(rover.v) * 5.0);
              setRoverHealth(Math.max(0, Math.round(100 - roverDamage)));
            }
            rover.v *= -0.3;
          }
        }

        const hFront = getTerrainHeight(rover.x + Math.sin(rover.yaw) * 0.78, rover.z + Math.cos(rover.yaw) * 0.78);
        const hBack = getTerrainHeight(rover.x - Math.sin(rover.yaw) * 0.78, rover.z - Math.cos(rover.yaw) * 0.78);
        const hLeft = getTerrainHeight(rover.x - Math.cos(rover.yaw) * 0.62, rover.z + Math.sin(rover.yaw) * 0.62);
        const hRight = getTerrainHeight(rover.x + Math.cos(rover.yaw) * 0.62, rover.z - Math.sin(rover.yaw) * 0.62);

        rover.pitch += (-Math.atan2(hBack - hFront, 1.55) - rover.pitch) * Math.min(1, dt * 5);
        rover.roll += (Math.atan2(hLeft - hRight, 1.25) - rover.roll) * Math.min(1, dt * 5);
        rover.y += (((hFront + hBack) / 2) - rover.y) * Math.min(1, dt * 8);

        rover.group.position.set(rover.x, rover.y + 0.04, rover.z);
        rover.group.rotation.set(0, rover.yaw, 0);
        rover.group.rotateX(-rover.pitch);
        rover.group.rotateZ(-rover.roll);

        rover.wheels.forEach(w => { w.tire.rotation.x += (rover.v * dt) / 0.25; });
        rover.odometer += Math.abs(rover.v) * dt;

        const spdCMS = Math.abs(rover.v) * (sprint ? 28 : 12);
        setSpeedDisplay(spdCMS.toFixed(1));

        const compDeg = ((-rover.yaw * 180 / Math.PI) % 360 + 360) % 360;
        const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        setCompassHeading(`${cardinals[Math.round(compDeg / 45) % 8]} ${Math.round(compDeg)}°`);

        if (onTelemetryUpdate) {
          onTelemetryUpdate({
            speed: spdCMS,
            health: Math.max(0, 100 - roverDamage),
            sprintEnergy: rover.sprintEnergy,
            heading: compDeg,
            odometer: rover.odometer
          });
        }

        const curMission = MISSIONS[currentMi];
        const step = curMission.steps[stepIdx];
        if (step) {
          if (step.k === 'move' && rover.odometer > 4) advanceStep();
          else if (step.k === 'sprint' && sprint && rover.odometer > 8) advanceStep();
          else if (step.p) {
            const pt = step.p[0];
            activeTarget = pt;
            const dist = Math.hypot(pt[0] - rover.x, pt[1] - rover.z);
            setTargetDistanceText(`${dist.toFixed(0)}m`);
            if (dist < 5.5) advanceStep();
          }
        }

        if (activeTarget && beaconMesh) {
          beaconMesh.position.set(activeTarget[0], getTerrainHeight(activeTarget[0], activeTarget[1]) + 25, activeTarget[1]);
          beaconRing.position.set(activeTarget[0], getTerrainHeight(activeTarget[0], activeTarget[1]) + 0.35, activeTarget[1]);
          beaconRing.rotation.z += dt * 1.5;
        }

        if (motorGain && motorOsc) {
          motorGain.gain.value = Math.min(0.08, Math.abs(rover.v) * 0.02 + (fwd ? 0.02 : 0));
          motorOsc.frequency.value = 36 + Math.abs(rover.v) * 8 + (sprint ? 24 : 0);
        }

        if (camViewIndex === 2) {
          camera.position.set(rover.x, rover.y + 1.45, rover.z);
          camera.lookAt(rover.x + Math.sin(rover.yaw) * 8, rover.y + 0.8, rover.z + Math.cos(rover.yaw) * 8);
        } else {
          const cDist = (camViewIndex === 1) ? 4.2 : camDist;
          const cyaw = rover.yaw + Math.PI + orbitYaw;
          const cx = rover.x + Math.sin(cyaw) * Math.cos(orbitPitch) * cDist;
          const cz = rover.z + Math.cos(cyaw) * Math.cos(orbitPitch) * cDist;
          const cy = Math.max(getTerrainHeight(cx, cz) + 1.2, rover.y + Math.sin(orbitPitch) * cDist + 0.5);
          camera.position.set(cx, cy, cz);
          camera.lookAt(rover.x, rover.y + 0.85, rover.z);
        }

        sunLight.position.set(rover.x - 70, 55, rover.z - 35);
        sunLight.target.position.set(rover.x, rover.y, rover.z);
      }

      renderer.render(scene, camera);
      drawRadar();
    }

    function advanceStep() {
      const curMission = MISSIONS[currentMi];
      stepIdx++;
      setObjectiveProgress((stepIdx / curMission.steps.length) * 100);
      if (curMission.cards[stepIdx]) {
        const c = curMission.cards[stepIdx];
        setActiveCard({ title: c[0], content: c[1] });
        if (onFactDiscovered) onFactDiscovered({ title: c[0], content: c[1] });
      }
      if (stepIdx >= curMission.steps.length) {
        const score = Math.round(1000 - impactCount * 30 - roverDamage * 4);
        const data = { mission: curMission.n, score, accuracy: Math.max(0, 100 - impactCount * 8) };
        setMissionCompleteData(data);
        if (onMissionComplete) onMissionComplete(data);
      } else {
        setCurrentObjective(curMission.steps[stepIdx].t);
      }
    }

    function drawRadar() {
      if (!mmCanvas) return;
      const ctx = mmCanvas.getContext('2d');
      const w = mmCanvas.width, h = mmCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = currentWorld === 'moon' ? '#04070d' : '#140c08';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-rover.yaw + Math.PI);
      ctx.fillStyle = '#69c9f2';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 3); ctx.lineTo(-5, 5);
      ctx.fill();
      ctx.restore();
    }

    animId = requestAnimationFrame(loop);

    gameRef.current = {
      setWorld: (newWorld) => buildWorld(newWorld),
      setVolume: (val) => { if (motorGain) motorGain.gain.value = val * 0.08; },
      resetRover: resetPosition,
      inspectTarget: checkInspection,
      toggleCamera: () => {
        camViewIndex = (camViewIndex + 1) % 3;
        const modes = ['ORBIT', 'CLOSE', 'MASTCAM'];
        setCameraModeName(modes[camViewIndex]);
      },
      destroy: () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPointerMove);
        if (audioCtx) audioCtx.close();
        renderer.dispose();
      }
    };

    return () => {
      if (gameRef.current) gameRef.current.destroy();
    };
  }, []);

  // Joystick Touch Events
  const joyTouchIdRef = useRef(null);
  const handleJoyTouchStart = e => {
    e.preventDefault();
    if (joyTouchIdRef.current !== null) return;
    const t = e.changedTouches[0];
    joyTouchIdRef.current = t.identifier;
    handleJoyMove(t.clientX, t.clientY);
  };

  const handleJoyTouchMove = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchIdRef.current) {
        handleJoyMove(t.clientX, t.clientY);
        e.preventDefault();
        break;
      }
    }
  };

  const handleJoyTouchEnd = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchIdRef.current) {
        joyTouchIdRef.current = null;
        if (joystickKnobRef.current) joystickKnobRef.current.style.transform = 'translate(-50%, -50%)';
        touchInputRef.current.forward = 0;
        touchInputRef.current.steer = 0;
        break;
      }
    }
  };

  const handleJoyMove = (clientX, clientY) => {
    if (!joystickBaseRef.current || !joystickKnobRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const maxR = 44;
    const dist = Math.min(maxR, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * dist;
    const ky = Math.sin(angle) * dist;

    joystickKnobRef.current.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    touchInputRef.current.forward = Math.max(-1, Math.min(1, -ky / maxR));
    touchInputRef.current.steer = Math.max(-1, Math.min(1, -kx / maxR));
  };

  return (
    <div className={`afterlight-rover-container ${className}`} ref={containerRef} style={style}>
      <canvas ref={canvasRef} className="afterlight-canvas" />

      {/* Built-in Educational HUD Overlay */}
      {showBuiltInUI && (
        <>
          {/* Top Left: Mission Objectives */}
          <div className="al-hud al-tl">
            <span className="al-label">{worldState.toUpperCase()} MISSION</span>
            <div className="al-objective">{currentObjective}</div>
            <div className="al-bar-track">
              <div className="al-bar-fill" style={{ width: `${objectiveProgress}%` }} />
            </div>
          </div>

          {/* Top Center: Heading & Distance */}
          <div className="al-hud al-tc">
            <span className="al-compass">{compassHeading}</span> · 
            <span className="al-target-dist">BEACON: {targetDistanceText}</span>
          </div>

          {/* Top Right: Status */}
          <div className="al-hud al-tr">
            <span className="al-label">ROVER INTEGRITY</span>
            <div className="al-status" style={{ color: roverHealth > 60 ? '#4ade80' : '#ef4444' }}>
              {roverHealth}% HEALTH
            </div>
            <div className="al-bar-track al-health">
              <div className="al-bar-fill" style={{ width: `${roverHealth}%` }} />
            </div>
          </div>

          {/* Bottom Right: Radar & Speedometer */}
          <div className="al-hud al-br">
            <div className="al-radar-wrap">
              <canvas ref={minimapCanvasRef} width={130} height={130} />
              <div className="al-radar-label">RADAR 80m</div>
            </div>
            <div className="al-telemetry-box">
              <div className="al-speed">{speedDisplay} <small>cm/s</small></div>
              <div className="al-sprint-wrap">
                <span className="al-sprint-label">TORQUE RESERVE {sprintEnergy}%</span>
                <div className="al-bar-track al-sprint">
                  <div className="al-bar-fill" style={{ width: `${sprintEnergy}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Left: Desktop Controls Guide (hidden on mobile) */}
          <div className="al-hud al-bl">
            <div className="al-controls-summary">
              <b>WASD</b> drive · <b>Shift</b> Sprint · <b>E</b> Inspect · <b>R</b> Reset
            </div>
          </div>

          {/* Mobile On-Screen Virtual Controls */}
          <div className="al-mobile-controls">
            {/* Virtual Thumbstick */}
            <div
              className="al-joystick-zone"
              onTouchStart={handleJoyTouchStart}
              onTouchMove={handleJoyTouchMove}
              onTouchEnd={handleJoyTouchEnd}
              onTouchCancel={handleJoyTouchEnd}
            >
              <div className="al-joystick-base" ref={joystickBaseRef}>
                <div className="al-joystick-knob" ref={joystickKnobRef} />
              </div>
            </div>

            {/* Mobile Action Buttons */}
            <div className="al-action-buttons">
              <button
                className={`al-touch-btn al-touch-scan ${isNearTarget ? 'active' : ''}`}
                onClick={() => gameRef.current && gameRef.current.inspectTarget()}
                title="Scan Target"
              >
                🔬<span style={{ fontSize: 8 }}>SCAN</span>
              </button>
              <div className="al-btn-row">
                <button
                  className="al-touch-btn al-touch-reset"
                  onClick={() => gameRef.current && gameRef.current.resetRover()}
                  title="Reset Upright"
                >
                  ↺
                </button>
                <button
                  className="al-touch-btn al-touch-cam"
                  onClick={() => gameRef.current && gameRef.current.toggleCamera()}
                  title="Cycle Camera"
                >
                  📷
                </button>
              </div>
              <div className="al-btn-row">
                <button
                  className="al-touch-btn al-touch-brake"
                  onTouchStart={e => { e.preventDefault(); touchInputRef.current.brake = true; }}
                  onTouchEnd={e => { e.preventDefault(); touchInputRef.current.brake = false; }}
                  onMouseDown={() => { touchInputRef.current.brake = true; }}
                  onMouseUp={() => { touchInputRef.current.brake = false; }}
                  title="Handbrake"
                >
                  🛑<span style={{ fontSize: 8 }}>BRAKE</span>
                </button>
                <button
                  className="al-touch-btn al-touch-sprint"
                  onTouchStart={e => { e.preventDefault(); touchInputRef.current.sprint = true; }}
                  onTouchEnd={e => { e.preventDefault(); touchInputRef.current.sprint = false; }}
                  onMouseDown={() => { touchInputRef.current.sprint = true; }}
                  onMouseUp={() => { touchInputRef.current.sprint = false; }}
                  title="Overdrive Sprint"
                >
                  ⚡<span style={{ fontSize: 8 }}>SPRINT</span>
                </button>
              </div>
            </div>
          </div>

          {/* Educational Fact Pop-up Card */}
          {activeCard && (
            <div className="al-modal-card" onClick={() => setActiveCard(null)} title="Click or tap to dismiss">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="al-card-title">{activeCard.title}</div>
                <button
                  style={{ background: 'transparent', border: 'none', color: '#A8B8CA', fontSize: '13px', cursor: 'pointer', padding: '0 4px' }}
                  onClick={(e) => { e.stopPropagation(); setActiveCard(null); }}
                  title="Dismiss card"
                >
                  ✕
                </button>
              </div>
              <div className="al-card-body">{activeCard.content}</div>
              <button className="al-btn al-card-close" onClick={() => setActiveCard(null)}>
                Got It
              </button>
            </div>
          )}

          {/* Scientific Inspection Modal */}
          {inspectionTarget && (
            <div className="al-overlay">
              <div className="al-dialog">
                <h2>ANOMALY DETECTED: {inspectionTarget}</h2>
                <p>APXS Alpha-Proton X-Ray Spectrometry confirms high silicon-aluminum basaltic matrix.</p>
                <button className="al-btn" onClick={() => setInspectionTarget(null)}>
                  Save Scientific Data
                </button>
              </div>
            </div>
          )}

          {/* Mission Success Modal */}
          {missionCompleteData && (
            <div className="al-overlay">
              <div className="al-dialog al-success">
                <h2>MISSION COMPLETE! 🚀</h2>
                <p>Exploration Rating: <b>{missionCompleteData.score} pts</b></p>
                <p>Navigation Accuracy: <b>{missionCompleteData.accuracy}%</b></p>
                <button className="al-btn" onClick={() => setMissionCompleteData(null)}>
                  Return to Exploration
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
