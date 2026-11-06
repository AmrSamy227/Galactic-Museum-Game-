/**
 * AFTERLIGHT - Mars Rover 3D Game
 * Terrain & Environment System
 * 
 * Procedural Mars terrain with rocks, scientific targets,
 * navigation checkpoints, atmosphere, and dust particles.
 * Uses Three.js (global THREE) - no imports.
 */

(function () {
    'use strict';

    // =========================================================================
    // NOISE IMPLEMENTATION (Simplex-like 2D noise, no external libs)
    // =========================================================================

    /**
     * Simple seeded pseudo-random number generator (Mulberry32)
     */
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /**
     * 2D gradient noise implementation using permutation table.
     * Produces smooth, continuous noise in the range roughly [-1, 1].
     */
    const NoiseGen = (function () {
        const PERM_SIZE = 512;
        const perm = new Uint8Array(PERM_SIZE);
        const gradX = new Float32Array(PERM_SIZE);
        const gradY = new Float32Array(PERM_SIZE);

        // Seed the permutation table
        const rng = mulberry32(42);
        const base = new Uint8Array(256);
        for (let i = 0; i < 256; i++) base[i] = i;
        // Fisher-Yates shuffle
        for (let i = 255; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const tmp = base[i]; base[i] = base[j]; base[j] = tmp;
        }
        for (let i = 0; i < 512; i++) {
            perm[i] = base[i & 255];
            const angle = (perm[i] / 256.0) * Math.PI * 2;
            gradX[i] = Math.cos(angle);
            gradY[i] = Math.sin(angle);
        }

        function fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        function lerp(a, b, t) {
            return a + t * (b - a);
        }

        function dot2(ix, iy, fx, fy) {
            const idx = perm[(ix & 255) + perm[iy & 255]];
            return gradX[idx] * fx + gradY[idx] * fy;
        }

        /**
         * 2D Perlin noise, returns value roughly in [-1, 1]
         */
        function noise2D(x, y) {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = x - xi;
            const yf = y - yi;
            const u = fade(xf);
            const v = fade(yf);
            const n00 = dot2(xi, yi, xf, yf);
            const n10 = dot2(xi + 1, yi, xf - 1, yf);
            const n01 = dot2(xi, yi + 1, xf, yf - 1);
            const n11 = dot2(xi + 1, yi + 1, xf - 1, yf - 1);
            return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
        }

        /**
         * Fractal Brownian Motion (multi-octave noise)
         */
        function fbm(x, y, octaves, lacunarity, gain) {
            let sum = 0;
            let amp = 1;
            let freq = 1;
            let maxAmp = 0;
            for (let i = 0; i < octaves; i++) {
                sum += noise2D(x * freq, y * freq) * amp;
                maxAmp += amp;
                amp *= gain;
                freq *= lacunarity;
            }
            return sum / maxAmp;
        }

        return { noise2D, fbm };
    })();


    // =========================================================================
    // CONSTANTS
    // =========================================================================

    const TERRAIN_SIZE = 800;
    const TERRAIN_SEGMENTS = 256;
    const TERRAIN_HEIGHT_MIN = -8;
    const TERRAIN_HEIGHT_MAX = 15;
    const TERRAIN_HEIGHT_RANGE = TERRAIN_HEIGHT_MAX - TERRAIN_HEIGHT_MIN;

    // Mars color palette
    const COL_DARK_RUST = new THREE.Color(0x8B4513);
    const COL_RED_ORANGE = new THREE.Color(0xC1440E);
    const COL_SANDY = new THREE.Color(0xD2691E);
    const COL_ROCKY_DARK = new THREE.Color(0x5C3317);
    const COL_DUST_LIGHT = new THREE.Color(0xCC7744);


    // =========================================================================
    // TERRAIN SYSTEM
    // =========================================================================

    /** @type {THREE.Scene} */
    let scene = null;

    /** @type {THREE.Mesh} */
    let terrainMesh = null;

    /** Heights array for fast lookup (row-major, (segments+1) x (segments+1)) */
    let heightData = null;
    const heightRes = TERRAIN_SEGMENTS + 1;

    /** Rock colliders [{x, z, radius, height}] */
    let rockColliders = [];

    /** Scientific targets array */
    let scientificTargets = [];
    let targetMarkerMeshes = [];

    /** Checkpoint system */
    let checkpoints = [];      // [{id, x, z, mesh, glowMesh}]
    let checkpointGroup = null;

    /** Dust particles */
    let dustPoints = null;
    let dustPositions = null;
    let dustVelocities = null;
    const DUST_COUNT = 500;

    /** Random for deterministic placement */
    const placeRng = mulberry32(7777);


    // =========================================================================
    // TERRAIN GENERATION
    // =========================================================================

    /**
     * Sample the procedural height at normalized terrain coordinates.
     * @param {number} nx - Normalized x in [0, 1]
     * @param {number} ny - Normalized y in [0, 1]
     * @returns {number} Height value in [TERRAIN_HEIGHT_MIN, TERRAIN_HEIGHT_MAX]
     */
    function sampleProceduralHeight(nx, ny) {
        // Map to noise space (centered)
        const sx = (nx - 0.5) * 4.0;
        const sy = (ny - 0.5) * 4.0;

        // Base terrain: multi-octave noise for rolling hills
        let h = NoiseGen.fbm(sx * 0.5, sy * 0.5, 6, 2.0, 0.5);

        // Add larger-scale gentle slopes
        h += NoiseGen.fbm(sx * 0.15 + 10, sy * 0.15 + 10, 3, 2.0, 0.45) * 0.6;

        // Add fine detail
        h += NoiseGen.fbm(sx * 2.0 + 5, sy * 2.0 + 5, 3, 2.5, 0.4) * 0.08;

        // Ridge formations: take absolute value of noise for ridges
        const ridge = 1.0 - Math.abs(NoiseGen.fbm(sx * 0.35 + 20, sy * 0.35 + 20, 4, 2.0, 0.5));
        h += ridge * ridge * 0.3;

        // Craters: add several circular depressions
        const craters = [
            { cx: 0.3, cy: 0.4, r: 0.06, depth: 0.4 },
            { cx: 0.7, cy: 0.6, r: 0.08, depth: 0.5 },
            { cx: 0.5, cy: 0.2, r: 0.05, depth: 0.35 },
            { cx: 0.2, cy: 0.75, r: 0.07, depth: 0.45 },
            { cx: 0.8, cy: 0.3, r: 0.04, depth: 0.3 },
            { cx: 0.6, cy: 0.8, r: 0.055, depth: 0.38 },
            { cx: 0.15, cy: 0.5, r: 0.045, depth: 0.32 },
            { cx: 0.85, cy: 0.85, r: 0.065, depth: 0.42 },
        ];
        for (let i = 0; i < craters.length; i++) {
            const c = craters[i];
            const dx = nx - c.cx;
            const dy = ny - c.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < c.r * 2.0) {
                const t = dist / c.r;
                if (t < 1.0) {
                    // Inside crater: bowl shape
                    const bowl = (t * t - 1.0) * c.depth;
                    h += bowl;
                    // Slight rim
                } else if (t < 1.6) {
                    // Rim: slight raise
                    const rimT = (t - 1.0) / 0.6;
                    h += c.depth * 0.15 * Math.sin(rimT * Math.PI);
                }
            }
        }

        // Flatten center area slightly (spawn zone) - keep it gentle
        const distFromCenter = Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5));
        if (distFromCenter < 0.05) {
            const flatT = distFromCenter / 0.05;
            const flatFactor = flatT * flatT;
            h = h * flatFactor + 0.0 * (1.0 - flatFactor);
        }

        // Map to height range
        // h is roughly in [-1.2, 1.5], normalize
        h = (h + 1.2) / 2.7; // roughly [0, 1]
        h = Math.max(0, Math.min(1, h));
        return TERRAIN_HEIGHT_MIN + h * TERRAIN_HEIGHT_RANGE;
    }

    /**
     * Build the terrain mesh with vertex colors
     */
    function createTerrain() {
        const geometry = new THREE.PlaneGeometry(
            TERRAIN_SIZE, TERRAIN_SIZE,
            TERRAIN_SEGMENTS, TERRAIN_SEGMENTS
        );

        // Rotate plane to be horizontal (XZ plane)
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const vertCount = positions.length / 3;

        // Allocate height data for lookup
        heightData = new Float32Array(vertCount);

        // Displace vertices based on procedural noise
        for (let i = 0; i < vertCount; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];

            // Normalized coords [0,1]
            const nx = (x / TERRAIN_SIZE) + 0.5;
            const nz = (z / TERRAIN_SIZE) + 0.5;

            const h = sampleProceduralHeight(nx, nz);
            positions[i * 3 + 1] = h;
            heightData[i] = h;
        }

        geometry.attributes.position.needsUpdate = true;

        // Compute normals for lighting
        geometry.computeVertexNormals();

        // Apply vertex colors based on height and slope
        const normals = geometry.attributes.normal.array;
        const colors = new Float32Array(vertCount * 3);

        const colTemp = new THREE.Color();
        const colSlope = new THREE.Color(0x4A2A0A);

        for (let i = 0; i < vertCount; i++) {
            const h = heightData[i];
            const ny = normals[i * 3 + 1]; // Y component of normal (1 = flat, 0 = vertical)
            const slope = 1.0 - Math.abs(ny);

            // Height-based blend factor [0, 1]
            const ht = (h - TERRAIN_HEIGHT_MIN) / TERRAIN_HEIGHT_RANGE;

            // Blend between three height colors
            if (ht < 0.35) {
                const t = ht / 0.35;
                colTemp.copy(COL_DARK_RUST).lerp(COL_RED_ORANGE, t);
            } else if (ht < 0.7) {
                const t = (ht - 0.35) / 0.35;
                colTemp.copy(COL_RED_ORANGE).lerp(COL_SANDY, t);
            } else {
                const t = (ht - 0.7) / 0.3;
                colTemp.copy(COL_SANDY).lerp(COL_DUST_LIGHT, Math.min(t, 1));
            }

            // Add slight noise variation to break up uniformity
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];
            const colorNoise = NoiseGen.noise2D(x * 0.05, z * 0.05) * 0.08;
            colTemp.r = Math.max(0, Math.min(1, colTemp.r + colorNoise));
            colTemp.g = Math.max(0, Math.min(1, colTemp.g + colorNoise * 0.6));
            colTemp.b = Math.max(0, Math.min(1, colTemp.b + colorNoise * 0.3));

            // Mix in dark rocky tones on steep slopes
            if (slope > 0.15) {
                const slopeBlend = Math.min((slope - 0.15) / 0.4, 1.0);
                colTemp.lerp(colSlope, slopeBlend * 0.7);
            }

            colors[i * 3] = colTemp.r;
            colors[i * 3 + 1] = colTemp.g;
            colors[i * 3 + 2] = colTemp.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // PBR material with vertex colors
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.92,
            metalness: 0.05,
            flatShading: false,
            side: THREE.FrontSide,
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.receiveShadow = true;
        terrainMesh.name = 'MarsTerrain';

        scene.add(terrainMesh);
    }


    // =========================================================================
    // HEIGHT / NORMAL SAMPLING
    // =========================================================================

    /**
     * Get terrain height at arbitrary world position using bilinear interpolation.
     * @param {number} x - World X
     * @param {number} z - World Z
     * @returns {number} Interpolated height
     */
    function getHeightAt(x, z) {
        if (!heightData) return 0;

        // Convert world coords to grid coords
        const halfSize = TERRAIN_SIZE / 2;
        // Clamp to terrain bounds
        const cx = Math.max(-halfSize, Math.min(halfSize, x));
        const cz = Math.max(-halfSize, Math.min(halfSize, z));

        // Normalized [0, 1]
        const u = (cx + halfSize) / TERRAIN_SIZE;
        const v = (cz + halfSize) / TERRAIN_SIZE;

        // Grid indices (float)
        const gx = u * TERRAIN_SEGMENTS;
        const gz = v * TERRAIN_SEGMENTS;

        // Integer cell
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);

        // Fractional part
        const fx = gx - ix;
        const fz = gz - iz;

        // Clamp indices
        const ix0 = Math.min(ix, TERRAIN_SEGMENTS - 1);
        const iz0 = Math.min(iz, TERRAIN_SEGMENTS - 1);
        const ix1 = Math.min(ix0 + 1, TERRAIN_SEGMENTS);
        const iz1 = Math.min(iz0 + 1, TERRAIN_SEGMENTS);

        // Sample four corners (row-major: row = iz, col = ix)
        const h00 = heightData[iz0 * heightRes + ix0];
        const h10 = heightData[iz0 * heightRes + ix1];
        const h01 = heightData[iz1 * heightRes + ix0];
        const h11 = heightData[iz1 * heightRes + ix1];

        // Bilinear interpolation
        const h0 = h00 + (h10 - h00) * fx;
        const h1 = h01 + (h11 - h01) * fx;
        return h0 + (h1 - h0) * fz;
    }

    /**
     * Get surface normal at arbitrary world position via central differences.
     * @param {number} x - World X
     * @param {number} z - World Z
     * @returns {THREE.Vector3} Normalized surface normal
     */
    function getNormalAt(x, z) {
        const eps = TERRAIN_SIZE / TERRAIN_SEGMENTS; // One grid cell
        const hL = getHeightAt(x - eps, z);
        const hR = getHeightAt(x + eps, z);
        const hD = getHeightAt(x, z - eps);
        const hU = getHeightAt(x, z + eps);

        // Cross product of tangent vectors gives normal
        const normal = new THREE.Vector3(
            (hL - hR) / (2 * eps),
            1.0,
            (hD - hU) / (2 * eps)
        );
        normal.normalize();
        return normal;
    }


    // =========================================================================
    // ROCK & BOULDER GENERATION
    // =========================================================================

    /**
     * Create a deformed rock geometry for organic-looking shapes.
     * @param {number} baseRadius - Base radius
     * @param {number} detail - Icosahedron detail level
     * @param {number} deformAmount - How much to deform
     * @returns {THREE.BufferGeometry}
     */
    function createRockGeometry(baseRadius, detail, deformAmount) {
        const geo = new THREE.IcosahedronGeometry(baseRadius, detail);
        const pos = geo.attributes.position;
        const vertex = new THREE.Vector3();

        // Seed a unique noise offset for this rock
        const offsetX = placeRng() * 100;
        const offsetY = placeRng() * 100;
        const offsetZ = placeRng() * 100;

        // Apply vertical squish for some rocks (stratified look)
        const squishY = 0.5 + placeRng() * 0.5; // 0.5 to 1.0

        for (let i = 0; i < pos.count; i++) {
            vertex.fromBufferAttribute(pos, i);

            // Normalize to get direction
            const dir = vertex.clone().normalize();

            // Multi-frequency noise displacement
            const n1 = NoiseGen.noise2D(
                dir.x * 2.0 + offsetX,
                dir.y * 2.0 + dir.z * 2.0 + offsetY
            ) * deformAmount;
            const n2 = NoiseGen.noise2D(
                dir.x * 5.0 + offsetZ,
                dir.z * 5.0 + offsetX
            ) * deformAmount * 0.3;

            const scale = 1.0 + n1 + n2;
            vertex.multiplyScalar(scale);
            vertex.y *= squishY;

            pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    /**
     * Create a Mars-colored rock material with variation.
     * @returns {THREE.MeshStandardMaterial}
     */
    function createRockMaterial() {
        const palette = [
            0x8B4513, // Saddle brown
            0x7A3B10, // Dark rust
            0x9C5A2E, // Medium brown
            0x6B3A2A, // Dark reddish brown
            0xA0522D, // Sienna
            0x8C6B4A, // Gray-brown
            0xB87333, // Sandy copper
            0x704214, // Deep brown
            0x9B6B47, // Warm tan-brown
        ];

        const baseColor = palette[(placeRng() * palette.length) | 0];
        const color = new THREE.Color(baseColor);

        // Slight random hue variation
        const hsl = {};
        color.getHSL(hsl);
        hsl.h += (placeRng() - 0.5) * 0.03;
        hsl.s = Math.max(0.2, Math.min(0.8, hsl.s + (placeRng() - 0.5) * 0.15));
        hsl.l = Math.max(0.1, Math.min(0.5, hsl.l + (placeRng() - 0.5) * 0.1));
        color.setHSL(hsl.h, hsl.s, hsl.l);

        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.85 + placeRng() * 0.10,
            metalness: 0.05 + placeRng() * 0.10,
            flatShading: placeRng() > 0.5, // Some faceted, some smooth
        });
    }

    /**
     * Generate and place all rocks on the terrain.
     * Uses InstancedMesh for small and medium rocks, individual meshes for large ones.
     */
    function createRocks() {
        const halfSize = TERRAIN_SIZE / 2;
        const placementRadius = halfSize * 0.85; // Keep rocks within most of the terrain
        const centerClearRadius = 12; // Clear area around spawn point

        // ---- TEMPLATES ----

        // Create a few template geometries for each size class
        const smallGeos = [];
        const medGeos = [];
        for (let i = 0; i < 4; i++) {
            smallGeos.push(createRockGeometry(1.0, 1, 0.25));
            medGeos.push(createRockGeometry(1.0, 2, 0.3));
        }

        // ---- SMALL ROCKS (instanced) ----
        const smallCount = 200;
        const smallMat = new THREE.MeshStandardMaterial({
            color: 0x8B5A3B,
            roughness: 0.9,
            metalness: 0.08,
            flatShading: true,
        });

        // Use one geometry template, varied via scale in the instance matrix
        const smallInstanced = new THREE.InstancedMesh(smallGeos[0], smallMat, smallCount);
        smallInstanced.castShadow = true;
        smallInstanced.receiveShadow = true;
        smallInstanced.name = 'SmallRocks';

        const dummy = new THREE.Object3D();
        const instanceColors = new Float32Array(smallCount * 3);
        const colPalette = [
            new THREE.Color(0x8B4513),
            new THREE.Color(0x7A3B10),
            new THREE.Color(0x9C5A2E),
            new THREE.Color(0x6B3A2A),
            new THREE.Color(0xA0522D),
            new THREE.Color(0x8C6B4A),
        ];

        for (let i = 0; i < smallCount; i++) {
            // Random position within placement area
            let px, pz;
            do {
                px = (placeRng() - 0.5) * 2 * placementRadius;
                pz = (placeRng() - 0.5) * 2 * placementRadius;
            } while (Math.sqrt(px * px + pz * pz) < centerClearRadius);

            const radius = 0.3 + placeRng() * 0.5;
            const py = getHeightAt(px, pz) - radius * 0.3; // Slightly embedded

            dummy.position.set(px, py, pz);
            dummy.rotation.set(
                placeRng() * Math.PI * 2,
                placeRng() * Math.PI * 2,
                placeRng() * Math.PI * 2
            );
            dummy.scale.setScalar(radius);
            dummy.updateMatrix();
            smallInstanced.setMatrixAt(i, dummy.matrix);

            // Per-instance color
            const col = colPalette[(placeRng() * colPalette.length) | 0];
            instanceColors[i * 3] = col.r * (0.8 + placeRng() * 0.4);
            instanceColors[i * 3 + 1] = col.g * (0.8 + placeRng() * 0.4);
            instanceColors[i * 3 + 2] = col.b * (0.8 + placeRng() * 0.4);

            rockColliders.push({
                x: px,
                z: pz,
                radius: radius * 0.8,
                height: py
            });
        }

        // Set instance colors
        smallInstanced.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
        smallInstanced.instanceMatrix.needsUpdate = true;
        scene.add(smallInstanced);

        // ---- MEDIUM BOULDERS (instanced) ----
        const medCount = 80;
        const medMat = new THREE.MeshStandardMaterial({
            color: 0x9C6A3B,
            roughness: 0.88,
            metalness: 0.08,
            flatShading: false,
        });

        const medInstanced = new THREE.InstancedMesh(medGeos[0], medMat, medCount);
        medInstanced.castShadow = true;
        medInstanced.receiveShadow = true;
        medInstanced.name = 'MediumBoulders';

        const medColors = new Float32Array(medCount * 3);

        for (let i = 0; i < medCount; i++) {
            let px, pz;
            do {
                px = (placeRng() - 0.5) * 2 * placementRadius;
                pz = (placeRng() - 0.5) * 2 * placementRadius;
            } while (Math.sqrt(px * px + pz * pz) < centerClearRadius + 5);

            const radius = 1.0 + placeRng() * 1.5;
            const py = getHeightAt(px, pz) - radius * 0.25;

            dummy.position.set(px, py, pz);
            dummy.rotation.set(
                placeRng() * Math.PI * 2,
                placeRng() * Math.PI * 2,
                placeRng() * Math.PI * 2
            );
            // Slightly non-uniform scale for variety
            const sx = radius * (0.8 + placeRng() * 0.4);
            const sy = radius * (0.5 + placeRng() * 0.5);
            const sz = radius * (0.8 + placeRng() * 0.4);
            dummy.scale.set(sx, sy, sz);
            dummy.updateMatrix();
            medInstanced.setMatrixAt(i, dummy.matrix);

            const col = colPalette[(placeRng() * colPalette.length) | 0];
            medColors[i * 3] = col.r * (0.7 + placeRng() * 0.5);
            medColors[i * 3 + 1] = col.g * (0.7 + placeRng() * 0.5);
            medColors[i * 3 + 2] = col.b * (0.7 + placeRng() * 0.5);

            rockColliders.push({
                x: px,
                z: pz,
                radius: Math.max(sx, sz) * 0.7,
                height: py
            });
        }

        medInstanced.instanceColor = new THREE.InstancedBufferAttribute(medColors, 3);
        medInstanced.instanceMatrix.needsUpdate = true;
        scene.add(medInstanced);

        // ---- LARGE FORMATIONS (individual meshes for unique shapes) ----
        const largeCount = 20;
        // Some large rocks are clustered
        const clusterCenters = [];
        for (let c = 0; c < 4; c++) {
            clusterCenters.push({
                x: (placeRng() - 0.5) * placementRadius * 1.2,
                z: (placeRng() - 0.5) * placementRadius * 1.2,
            });
        }

        for (let i = 0; i < largeCount; i++) {
            const radius = 3.0 + placeRng() * 3.0;
            const geo = createRockGeometry(radius, 2, 0.35);
            const mat = createRockMaterial();
            const mesh = new THREE.Mesh(geo, mat);

            let px, pz;
            // 60% of large rocks near cluster centers
            if (i < 12 && clusterCenters.length > 0) {
                const cluster = clusterCenters[i % clusterCenters.length];
                px = cluster.x + (placeRng() - 0.5) * 30;
                pz = cluster.z + (placeRng() - 0.5) * 30;
            } else {
                do {
                    px = (placeRng() - 0.5) * 2 * placementRadius;
                    pz = (placeRng() - 0.5) * 2 * placementRadius;
                } while (Math.sqrt(px * px + pz * pz) < centerClearRadius + 10);
            }

            // Clamp within terrain
            px = Math.max(-placementRadius, Math.min(placementRadius, px));
            pz = Math.max(-placementRadius, Math.min(placementRadius, pz));

            const py = getHeightAt(px, pz) - radius * 0.2;

            mesh.position.set(px, py, pz);
            mesh.rotation.set(
                (placeRng() - 0.5) * 0.4,
                placeRng() * Math.PI * 2,
                (placeRng() - 0.5) * 0.3
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.name = 'LargeRock_' + i;

            scene.add(mesh);

            rockColliders.push({
                x: px,
                z: pz,
                radius: radius * 0.75,
                height: py
            });
        }
    }


    // =========================================================================
    // SCIENTIFIC POINTS OF INTEREST
    // =========================================================================

    /**
     * Create 8 scientific target locations with glowing ground markers.
     */
    function createScientificTargets() {
        const types = [
            { type: 'rock_sample', name: 'Barnacle Bill', desc: 'Andesite rock sample - compositionally similar to Earth continental crust.' },
            { type: 'soil_analysis', name: 'Ares Flats Soil', desc: 'Fine-grained regolith showing iron oxide signatures.' },
            { type: 'panorama_point', name: 'Twin Peaks Vista', desc: 'Elevated vantage point for 360° terrain panorama capture.' },
            { type: 'geological_formation', name: 'Yogi Boulder', desc: 'Large boulder showing evidence of water erosion patterns.' },
            { type: 'rock_sample', name: 'Scooby Doo', desc: 'Partially buried rock with unusual mineral coating.' },
            { type: 'soil_analysis', name: 'Mermaid Dune', desc: 'Wind-formed soil drift with layered dust deposits.' },
            { type: 'panorama_point', name: 'North Rim Overlook', desc: 'Northern crater rim with view of ancient flood channel.' },
            { type: 'geological_formation', name: 'Wedge Formation', desc: 'Layered sedimentary structure suggesting ancient lake bed.' },
        ];

        // Pre-defined positions spread across the map
        const positions = [
            { x: 45, z: 30 },
            { x: -60, z: 50 },
            { x: 80, z: -40 },
            { x: -30, z: -70 },
            { x: 100, z: 90 },
            { x: -90, z: -30 },
            { x: 20, z: -100 },
            { x: -70, z: 80 },
        ];

        const markerGroup = new THREE.Group();
        markerGroup.name = 'ScientificTargets';

        for (let i = 0; i < types.length; i++) {
            const pos = positions[i];
            const y = getHeightAt(pos.x, pos.z) + 0.15;

            const target = {
                id: 'target_' + i,
                type: types[i].type,
                position: { x: pos.x, y: y, z: pos.z },
                name: types[i].name,
                description: types[i].desc,
                discovered: false,
                inspected: false,
            };
            scientificTargets.push(target);

            // Create glowing ring marker on ground
            const ringGeo = new THREE.RingGeometry(1.2, 1.6, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x69C9F2,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(pos.x, y, pos.z);
            ring.name = 'TargetMarker_' + i;
            markerGroup.add(ring);

            // Inner glow dot
            const dotGeo = new THREE.CircleGeometry(0.5, 16);
            dotGeo.rotateX(-Math.PI / 2);
            const dotMat = new THREE.MeshBasicMaterial({
                color: 0x69C9F2,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(pos.x, y + 0.05, pos.z);
            markerGroup.add(dot);

            // Vertical light beam (very subtle)
            const beamGeo = new THREE.CylinderGeometry(0.05, 0.3, 2.5, 8);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0x69C9F2,
                transparent: true,
                opacity: 0.15,
                depthWrite: false,
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.set(pos.x, y + 1.25, pos.z);
            markerGroup.add(beam);

            targetMarkerMeshes.push({ ring, dot, beam, index: i });
        }

        scene.add(markerGroup);
    }

    /**
     * Animate scientific target markers (pulsing glow).
     * @param {number} time - Elapsed time in seconds
     */
    function updateTargetMarkers(time) {
        for (let i = 0; i < targetMarkerMeshes.length; i++) {
            const m = targetMarkerMeshes[i];
            const pulse = 0.4 + Math.sin(time * 2.0 + i * 0.8) * 0.25;
            const scalePulse = 1.0 + Math.sin(time * 1.5 + i * 1.2) * 0.1;

            m.ring.material.opacity = pulse;
            m.ring.scale.setScalar(scalePulse);

            m.dot.material.opacity = pulse * 0.5;

            m.beam.material.opacity = 0.08 + Math.sin(time * 3.0 + i) * 0.06;
        }
    }


    // =========================================================================
    // NAVIGATION CHECKPOINTS
    // =========================================================================

    /**
     * Initialize the checkpoint container group.
     */
    function initCheckpoints() {
        checkpointGroup = new THREE.Group();
        checkpointGroup.name = 'Checkpoints';
        scene.add(checkpointGroup);
    }

    /**
     * Create a checkpoint beacon at the given position.
     * @param {number} x - World X
     * @param {number} z - World Z
     * @param {string} id - Unique checkpoint identifier
     */
    function createCheckpoint(x, z, id) {
        // Remove existing checkpoint with same id
        removeCheckpoint(id);

        const y = getHeightAt(x, z);

        // Beacon column
        const beaconHeight = 3.0;
        const beaconGeo = new THREE.CylinderGeometry(0.08, 0.12, beaconHeight, 8);
        const beaconMat = new THREE.MeshStandardMaterial({
            color: 0xE47D54,
            emissive: 0xE47D54,
            emissiveIntensity: 0.8,
            roughness: 0.3,
            metalness: 0.2,
            transparent: true,
            opacity: 0.85,
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(x, y + beaconHeight / 2, z);
        beacon.castShadow = false;
        beacon.name = 'Checkpoint_' + id;

        // Glow halo at top
        const glowGeo = new THREE.SphereGeometry(0.3, 12, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xE47D54,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(x, y + beaconHeight + 0.15, z);

        // Ground ring
        const ringGeo = new THREE.RingGeometry(0.6, 0.9, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xE47D54,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, y + 0.1, z);

        checkpointGroup.add(beacon);
        checkpointGroup.add(glow);
        checkpointGroup.add(ring);

        checkpoints.push({ id, x, z, y, beacon, glow, ring });
    }

    /**
     * Remove a checkpoint by id.
     * @param {string} id - Checkpoint identifier
     */
    function removeCheckpoint(id) {
        const idx = checkpoints.findIndex(c => c.id === id);
        if (idx === -1) return;

        const cp = checkpoints[idx];
        checkpointGroup.remove(cp.beacon);
        checkpointGroup.remove(cp.glow);
        checkpointGroup.remove(cp.ring);

        // Dispose geometry and material
        cp.beacon.geometry.dispose();
        cp.beacon.material.dispose();
        cp.glow.geometry.dispose();
        cp.glow.material.dispose();
        cp.ring.geometry.dispose();
        cp.ring.material.dispose();

        checkpoints.splice(idx, 1);
    }

    /**
     * Remove all checkpoints.
     */
    function removeAllCheckpoints() {
        while (checkpoints.length > 0) {
            removeCheckpoint(checkpoints[0].id);
        }
    }

    /**
     * Animate checkpoint beacons.
     * @param {number} time - Elapsed time in seconds
     */
    function updateCheckpoints(time) {
        for (let i = 0; i < checkpoints.length; i++) {
            const cp = checkpoints[i];
            const pulse = 0.5 + Math.sin(time * 3.0 + i * 1.5) * 0.35;

            cp.beacon.material.emissiveIntensity = 0.5 + pulse * 0.5;
            cp.beacon.material.opacity = 0.6 + pulse * 0.3;

            cp.glow.material.opacity = 0.3 + pulse * 0.3;
            cp.glow.scale.setScalar(0.8 + pulse * 0.4);

            cp.ring.material.opacity = 0.2 + pulse * 0.25;
            const ringScale = 1.0 + Math.sin(time * 2.0 + i) * 0.15;
            cp.ring.scale.setScalar(ringScale);
        }
    }


    // =========================================================================
    // MARS SKY & ATMOSPHERE
    // =========================================================================

    /**
     * Create the Mars sky dome, lighting, and fog.
     */
    function createSkyAndAtmosphere() {
        // ---- SKY DOME ----
        const skyRadius = 500;
        const skyGeo = new THREE.SphereGeometry(skyRadius, 32, 24);
        // Invert normals so we see inside
        skyGeo.scale(-1, 1, 1);

        // Vertex-colored gradient from horizon to zenith
        const skyPositions = skyGeo.attributes.position;
        const skyColors = new Float32Array(skyPositions.count * 3);
        const horizonColor = new THREE.Color(0xC4956A);
        const zenithColor = new THREE.Color(0x6B4226);
        const tempColor = new THREE.Color();

        for (let i = 0; i < skyPositions.count; i++) {
            const y = skyPositions.getY(i);
            // Normalized height [0 at bottom, 1 at top]
            let t = (y / skyRadius + 1.0) * 0.5;
            // Apply a power curve for more natural gradient
            t = Math.pow(Math.max(0, t), 0.7);

            tempColor.copy(horizonColor).lerp(zenithColor, t);

            // Add slight haze/brightness near horizon
            if (t < 0.25) {
                const hazeFactor = 1.0 - t / 0.25;
                tempColor.r = Math.min(1, tempColor.r + hazeFactor * 0.1);
                tempColor.g = Math.min(1, tempColor.g + hazeFactor * 0.08);
                tempColor.b = Math.min(1, tempColor.b + hazeFactor * 0.05);
            }

            skyColors[i * 3] = tempColor.r;
            skyColors[i * 3 + 1] = tempColor.g;
            skyColors[i * 3 + 2] = tempColor.b;
        }

        skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));

        const skyMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false,
        });

        const skyMesh = new THREE.Mesh(skyGeo, skyMat);
        skyMesh.name = 'MarsSky';
        skyMesh.renderOrder = -1;
        scene.add(skyMesh);

        // ---- FOG ----
        scene.fog = new THREE.FogExp2(0xC4956A, 0.004);

        // ---- SUN (Directional Light) ----
        const sunLight = new THREE.DirectionalLight(0xFFE4C4, 1.5);
        sunLight.position.set(150, 120, -80);
        sunLight.castShadow = true;

        // Shadow settings
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 400;
        sunLight.shadow.bias = -0.0005;
        sunLight.shadow.normalBias = 0.02;

        scene.add(sunLight);
        scene.add(sunLight.target);

        // ---- AMBIENT LIGHT ----
        const ambientLight = new THREE.AmbientLight(0x8B6914, 0.4);
        scene.add(ambientLight);

        // ---- HEMISPHERE LIGHT ----
        const hemiLight = new THREE.HemisphereLight(0xC4956A, 0x5C3317, 0.3);
        scene.add(hemiLight);
    }


    // =========================================================================
    // DISTANT MOUNTAINS
    // =========================================================================

    /**
     * Create a ring of distant mountain silhouettes.
     */
    function createDistantMountains() {
        const mountainGroup = new THREE.Group();
        mountainGroup.name = 'DistantMountains';

        const mountRng = mulberry32(5555);
        const numMountains = 36;
        const baseDistance = 350;

        const mountainMat = new THREE.MeshBasicMaterial({
            color: 0x7A5C3E,
            fog: true,
            side: THREE.DoubleSide,
        });

        for (let i = 0; i < numMountains; i++) {
            const angle = (i / numMountains) * Math.PI * 2 + mountRng() * 0.15;
            const dist = baseDistance + mountRng() * 50;
            const width = 30 + mountRng() * 60;
            const height = 15 + mountRng() * 40;

            // Create a simple mountain shape from a cone with deformation
            const segments = 8 + (mountRng() * 6) | 0;
            const coneGeo = new THREE.ConeGeometry(width / 2, height, segments, 1);

            // Deform vertices for natural look
            const conePos = coneGeo.attributes.position;
            for (let v = 0; v < conePos.count; v++) {
                const vx = conePos.getX(v);
                const vy = conePos.getY(v);
                const vz = conePos.getZ(v);

                // Only deform non-base vertices
                if (vy > -height / 2 + 0.1) {
                    const noiseVal = NoiseGen.noise2D(
                        vx * 0.05 + i * 10,
                        vz * 0.05 + i * 7
                    );
                    conePos.setX(v, vx + noiseVal * width * 0.15);
                    conePos.setZ(v, vz + noiseVal * width * 0.12);
                    conePos.setY(v, vy + noiseVal * height * 0.15);
                }
            }

            coneGeo.computeVertexNormals();

            const mountainMesh = new THREE.Mesh(coneGeo, mountainMat.clone());

            // Color variation per mountain
            const brightness = 0.25 + mountRng() * 0.15;
            mountainMesh.material.color.setHSL(0.07, 0.3, brightness);

            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const baseY = getHeightAt(
                Math.cos(angle) * (TERRAIN_SIZE * 0.48),
                Math.sin(angle) * (TERRAIN_SIZE * 0.48)
            );
            mountainMesh.position.set(x, baseY - 5, z);
            mountainMesh.rotation.y = mountRng() * Math.PI * 2;

            // Slight random tilt
            mountainMesh.rotation.x = (mountRng() - 0.5) * 0.1;
            mountainMesh.rotation.z = (mountRng() - 0.5) * 0.1;

            mountainGroup.add(mountainMesh);
        }

        scene.add(mountainGroup);
    }


    // =========================================================================
    // DUST PARTICLES
    // =========================================================================

    /**
     * Create a floating dust particle system.
     */
    function createDustParticles() {
        const positions = new Float32Array(DUST_COUNT * 3);
        dustVelocities = new Float32Array(DUST_COUNT * 3);
        const sizes = new Float32Array(DUST_COUNT);
        const opacities = new Float32Array(DUST_COUNT);

        const dustRng = mulberry32(9999);

        for (let i = 0; i < DUST_COUNT; i++) {
            // Spread particles around the origin area, they'll follow the camera later
            positions[i * 3] = (dustRng() - 0.5) * 120;
            positions[i * 3 + 1] = 1 + dustRng() * 8;
            positions[i * 3 + 2] = (dustRng() - 0.5) * 120;

            // Slow drifting velocities (wind direction mostly +X with variation)
            dustVelocities[i * 3] = 0.3 + dustRng() * 0.4;      // X drift (wind)
            dustVelocities[i * 3 + 1] = (dustRng() - 0.5) * 0.1; // slight Y wobble
            dustVelocities[i * 3 + 2] = (dustRng() - 0.5) * 0.2; // Z variation

            sizes[i] = 0.3 + dustRng() * 0.5;
            opacities[i] = 0.1 + dustRng() * 0.2;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        dustPositions = positions;

        // Simple dust particle material
        const material = new THREE.PointsMaterial({
            color: 0xC4956A,
            size: 0.4,
            transparent: true,
            opacity: 0.15,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        dustPoints = new THREE.Points(geometry, material);
        dustPoints.name = 'DustParticles';
        dustPoints.frustumCulled = false;
        scene.add(dustPoints);
    }

    /**
     * Update dust particle positions.
     * @param {number} time - Elapsed time in seconds
     */
    function updateDustParticles(time) {
        if (!dustPoints || !dustPositions) return;

        const posAttr = dustPoints.geometry.attributes.position;
        const arr = posAttr.array;
        const halfSpread = 60;

        for (let i = 0; i < DUST_COUNT; i++) {
            const i3 = i * 3;

            // Move by velocity with time-based swirl
            arr[i3] += dustVelocities[i3] * 0.016;
            arr[i3 + 1] += Math.sin(time * 0.5 + i * 0.1) * 0.005;
            arr[i3 + 2] += dustVelocities[i3 + 2] * 0.016;

            // Wrap around a box centered on origin
            if (arr[i3] > halfSpread) arr[i3] -= halfSpread * 2;
            if (arr[i3] < -halfSpread) arr[i3] += halfSpread * 2;
            if (arr[i3 + 2] > halfSpread) arr[i3 + 2] -= halfSpread * 2;
            if (arr[i3 + 2] < -halfSpread) arr[i3 + 2] += halfSpread * 2;

            // Keep above terrain
            const terrainH = getHeightAt(arr[i3], arr[i3 + 2]);
            if (arr[i3 + 1] < terrainH + 0.5) {
                arr[i3 + 1] = terrainH + 0.5 + Math.random() * 3;
            }
        }

        posAttr.needsUpdate = true;

        // Subtle opacity pulsing
        dustPoints.material.opacity = 0.12 + Math.sin(time * 0.3) * 0.04;
    }


    // =========================================================================
    // MAIN API
    // =========================================================================

    window.TerrainSystem = {
        /**
         * Initialize all terrain and environment systems.
         * @param {THREE.Scene} sceneRef - The Three.js scene to populate
         */
        init: function (sceneRef) {
            scene = sceneRef;

            // Build terrain first (needed for height queries)
            createTerrain();

            // Sky and atmosphere
            createSkyAndAtmosphere();

            // Distant mountains
            createDistantMountains();

            // Rocks and boulders
            createRocks();

            // Scientific points of interest
            createScientificTargets();

            // Checkpoint system
            initCheckpoints();

            // Dust particles
            createDustParticles();

            console.log('[TerrainSystem] Initialized: terrain, ' +
                rockColliders.length + ' rocks, ' +
                scientificTargets.length + ' science targets, sky, dust.');
        },

        /**
         * Get terrain height at world position.
         * @param {number} x - World X
         * @param {number} z - World Z
         * @returns {number}
         */
        getHeightAt: getHeightAt,

        /**
         * Get surface normal at world position.
         * @param {number} x - World X
         * @param {number} z - World Z
         * @returns {THREE.Vector3}
         */
        getNormalAt: getNormalAt,

        /**
         * Get rock collision data.
         * @returns {Array<{x: number, z: number, radius: number, height: number}>}
         */
        getRockColliders: function () {
            return rockColliders;
        },

        /**
         * Get scientific targets array.
         * @returns {Array}
         */
        getScientificTargets: function () {
            return scientificTargets;
        },

        /**
         * Animate scientific target markers.
         * @param {number} time
         */
        updateTargetMarkers: updateTargetMarkers,

        /**
         * Create a navigation checkpoint.
         * @param {number} x
         * @param {number} z
         * @param {string} id
         */
        createCheckpoint: createCheckpoint,

        /**
         * Remove a checkpoint by id.
         * @param {string} id
         */
        removeCheckpoint: removeCheckpoint,

        /**
         * Remove all checkpoints.
         */
        removeAllCheckpoints: removeAllCheckpoints,

        /**
         * Animate checkpoints.
         * @param {number} time
         */
        updateCheckpoints: updateCheckpoints,

        /**
         * Get all active checkpoints.
         * @returns {Array}
         */
        getCheckpoints: function () {
            return checkpoints.map(c => ({
                id: c.id,
                x: c.x,
                z: c.z,
                y: c.y,
            }));
        },

        /**
         * Update dust particle system.
         * @param {number} time
         */
        updateDustParticles: updateDustParticles,

        /**
         * Master update - call each frame.
         * @param {number} time - Elapsed time in seconds
         */
        update: function (time) {
            updateTargetMarkers(time);
            updateCheckpoints(time);
            updateDustParticles(time);
        },
    };

})();
