// ============================================================================
// AFTERLIGHT - Mars Rover 3D System
// Complete rover model, physics, and control system using Three.js
// ============================================================================

(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    const ROVER_BODY_W = 1.2;    // length (x)
    const ROVER_BODY_H = 0.35;   // height (y)
    const ROVER_BODY_D = 0.8;    // depth (z)

    const WHEEL_RADIUS = 0.15;
    const WHEEL_WIDTH = 0.12;
    const WHEEL_SEGMENTS = 16;
    const TREAD_COUNT = 12;

    const SOLAR_PANEL_W = 1.4;
    const SOLAR_PANEL_H = 0.02;
    const SOLAR_PANEL_D = 0.9;
    const SOLAR_PANEL_Y_OFFSET = 0.15;

    const SUSPENSION_ARM_THICKNESS = 0.035;

    const COLLISION_RADIUS = 0.7;

    // Physics constants
    const MAX_SPEED = 2.0;
    const ACCELERATION = 1.5;
    const DECELERATION = 3.0;
    const FRICTION = 1.0;
    const TURN_SPEED = 1.2;
    const BODY_LERP = 0.1;

    // Safe position update interval
    const SAFE_POS_INTERVAL = 3.0;

    // -----------------------------------------------------------------------
    // Materials (shared across components)
    // -----------------------------------------------------------------------
    let materials = {};

    function createMaterials() {
        materials = {
            body: new THREE.MeshStandardMaterial({
                color: 0xB8A070,
                metalness: 0.6,
                roughness: 0.4
            }),
            bodyDamage: new THREE.MeshStandardMaterial({
                color: 0xCC5533,
                metalness: 0.6,
                roughness: 0.4
            }),
            solarPanel: new THREE.MeshStandardMaterial({
                color: 0x1a1a3e,
                metalness: 0.3,
                roughness: 0.2
            }),
            solarEdge: new THREE.LineBasicMaterial({
                color: 0x2a2a5e,
                linewidth: 1
            }),
            solarGrid: new THREE.LineBasicMaterial({
                color: 0x2a2a5e,
                transparent: true,
                opacity: 0.5
            }),
            suspensionArm: new THREE.MeshStandardMaterial({
                color: 0x666666,
                metalness: 0.7,
                roughness: 0.3
            }),
            wheel: new THREE.MeshStandardMaterial({
                color: 0x333333,
                metalness: 0.15,
                roughness: 0.9
            }),
            tread: new THREE.MeshStandardMaterial({
                color: 0x222222,
                metalness: 0.1,
                roughness: 0.95
            }),
            antenna: new THREE.MeshStandardMaterial({
                color: 0xAAAAAA,
                metalness: 0.8,
                roughness: 0.2
            }),
            cameraMast: new THREE.MeshStandardMaterial({
                color: 0x444444,
                metalness: 0.6,
                roughness: 0.4
            }),
            lens: new THREE.MeshStandardMaterial({
                color: 0x111111,
                metalness: 0.9,
                roughness: 0.1
            }),
            armJoint: new THREE.MeshStandardMaterial({
                color: 0x888888,
                metalness: 0.5,
                roughness: 0.4
            }),
            web: new THREE.MeshStandardMaterial({
                color: 0xA09060,
                metalness: 0.5,
                roughness: 0.5
            }),
            deckPanel: new THREE.MeshStandardMaterial({
                color: 0xC0B080,
                metalness: 0.4,
                roughness: 0.5
            })
        };
    }

    // -----------------------------------------------------------------------
    // Rover State
    // -----------------------------------------------------------------------
    let state = {
        health: 100,
        batteryLevel: 100,
        speed: 0,
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        isStuck: false,
        odometer: 0
    };

    let currentSpeed = 0;
    let heading = 0;
    let shakeAmount = 0;
    let shakeDuration = 0;
    let damageFlashTime = 0;

    // Safe position tracking
    let lastSafePosition = new THREE.Vector3(0, 0, 0);
    let safePositionTimer = 0;
    let isResetting = false;
    let resetProgress = 0;
    let resetStartPos = new THREE.Vector3();
    let resetTargetPos = new THREE.Vector3();

    // Arm animation state
    let armState = 'retracted'; // 'retracted', 'extending', 'extended', 'retracting'
    let armProgress = 0; // 0 = retracted, 1 = extended

    // -----------------------------------------------------------------------
    // Rover Group & Component References
    // -----------------------------------------------------------------------
    let roverGroup = null;
    let bodyMesh = null;
    let solarPanelMesh = null;
    let wheels = [];       // Array of { mesh, side, position, localX, localZ, currentHeight }
    let rockerArms = { left: null, right: null };
    let bogieArms = { left: null, right: null };
    let armSegments = [];  // IDD arm segments
    let armJoints = [];    // IDD arm joints

    // Wheel layout positions relative to rover center
    // [frontLeft, frontRight, middleLeft, middleRight, rearLeft, rearRight]
    const wheelPositions = [
        { x: 0.45, z: -0.50, side: 'left',  row: 'front' },   // front-left
        { x: 0.45, z: 0.50, side: 'right', row: 'front' },    // front-right
        { x: 0.0, z: -0.50, side: 'left',  row: 'middle' },   // middle-left
        { x: 0.0, z: 0.50, side: 'right', row: 'middle' },    // middle-right
        { x: -0.42, z: -0.50, side: 'left',  row: 'rear' },   // rear-left
        { x: -0.42, z: 0.50, side: 'right', row: 'rear' }     // rear-right
    ];

    // -----------------------------------------------------------------------
    // Model Building Functions
    // -----------------------------------------------------------------------

    /**
     * Creates a single wheel with tread pattern
     */
    function createWheel() {
        const wheelGroup = new THREE.Group();

        // Main wheel cylinder (rotated so it rolls along X when spun around Z)
        const wheelGeo = new THREE.CylinderGeometry(
            WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, WHEEL_SEGMENTS
        );
        const wheelMesh = new THREE.Mesh(wheelGeo, materials.wheel);
        wheelMesh.rotation.x = Math.PI / 2;
        wheelMesh.castShadow = true;
        wheelMesh.receiveShadow = true;
        wheelGroup.add(wheelMesh);

        // Tread pattern – small boxes around circumference
        const treadGeo = new THREE.BoxGeometry(0.03, 0.02, WHEEL_WIDTH + 0.005);
        for (let i = 0; i < TREAD_COUNT; i++) {
            const angle = (i / TREAD_COUNT) * Math.PI * 2;
            const tread = new THREE.Mesh(treadGeo, materials.tread);
            tread.position.x = Math.cos(angle) * (WHEEL_RADIUS + 0.008);
            tread.position.y = Math.sin(angle) * (WHEEL_RADIUS + 0.008);
            tread.rotation.z = angle;
            tread.castShadow = true;
            wheelGroup.add(tread);
        }

        // Hub cap – small disc on each side
        const hubGeo = new THREE.CylinderGeometry(0.04, 0.04, WHEEL_WIDTH + 0.02, 8);
        const hubMesh = new THREE.Mesh(hubGeo, materials.suspensionArm);
        hubMesh.rotation.x = Math.PI / 2;
        wheelGroup.add(hubMesh);

        return wheelGroup;
    }

    /**
     * Creates the main chassis body
     */
    function createBody() {
        const bodyGroup = new THREE.Group();

        // Main chassis
        const chassisGeo = new THREE.BoxGeometry(ROVER_BODY_W, ROVER_BODY_H, ROVER_BODY_D);
        bodyMesh = new THREE.Mesh(chassisGeo, materials.body);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        bodyGroup.add(bodyMesh);

        // Warm Electronics Box (WEB) on the rear
        const webGeo = new THREE.BoxGeometry(0.3, 0.25, 0.6);
        const webMesh = new THREE.Mesh(webGeo, materials.web);
        webMesh.position.set(-0.35, -0.05, 0);
        webMesh.castShadow = true;
        bodyGroup.add(webMesh);

        // Equipment deck on top – flat panel
        const deckGeo = new THREE.BoxGeometry(ROVER_BODY_W - 0.1, 0.03, ROVER_BODY_D - 0.1);
        const deckMesh = new THREE.Mesh(deckGeo, materials.deckPanel);
        deckMesh.position.set(0, ROVER_BODY_H / 2 + 0.015, 0);
        deckMesh.castShadow = true;
        bodyGroup.add(deckMesh);

        // Front hazard cameras (two small cylinders on front face)
        const hazCamGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8);
        for (let side = -1; side <= 1; side += 2) {
            const hazCam = new THREE.Mesh(hazCamGeo, materials.lens);
            hazCam.rotation.z = Math.PI / 2;
            hazCam.position.set(
                ROVER_BODY_W / 2 + 0.015,
                ROVER_BODY_H / 2 - 0.06,
                side * 0.15
            );
            hazCam.castShadow = true;
            bodyGroup.add(hazCam);
        }

        return bodyGroup;
    }

    /**
     * Creates the solar panel with grid lines
     */
    function createSolarPanel() {
        const panelGroup = new THREE.Group();

        // Main panel
        const panelGeo = new THREE.BoxGeometry(SOLAR_PANEL_W, SOLAR_PANEL_H, SOLAR_PANEL_D);
        solarPanelMesh = new THREE.Mesh(panelGeo, materials.solarPanel);
        solarPanelMesh.castShadow = true;
        solarPanelMesh.receiveShadow = true;
        panelGroup.add(solarPanelMesh);

        // Edge lines
        const edgesGeo = new THREE.EdgesGeometry(panelGeo);
        const edgeLines = new THREE.LineSegments(edgesGeo, materials.solarEdge);
        panelGroup.add(edgeLines);

        // Subtle grid lines on top surface
        const gridPoints = [];
        const halfW = SOLAR_PANEL_W / 2;
        const halfD = SOLAR_PANEL_D / 2;
        const gridY = SOLAR_PANEL_H / 2 + 0.002;

        // Longitudinal lines
        for (let i = -3; i <= 3; i++) {
            const z = (i / 3) * halfD * 0.9;
            gridPoints.push(new THREE.Vector3(-halfW * 0.95, gridY, z));
            gridPoints.push(new THREE.Vector3(halfW * 0.95, gridY, z));
        }
        // Lateral lines
        for (let i = -4; i <= 4; i++) {
            const x = (i / 4) * halfW * 0.95;
            gridPoints.push(new THREE.Vector3(x, gridY, -halfD * 0.9));
            gridPoints.push(new THREE.Vector3(x, gridY, halfD * 0.9));
        }

        const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
        const gridLines = new THREE.LineSegments(gridGeo, materials.solarGrid);
        panelGroup.add(gridLines);

        // Position panel above body
        panelGroup.position.set(
            0,
            ROVER_BODY_H / 2 + SOLAR_PANEL_Y_OFFSET + SOLAR_PANEL_H / 2,
            0
        );

        // Small support struts
        const strutGeo = new THREE.CylinderGeometry(0.015, 0.015, SOLAR_PANEL_Y_OFFSET, 6);
        const strutPositions = [
            { x: -0.4, z: -0.3 },
            { x: -0.4, z: 0.3 },
            { x: 0.4, z: -0.3 },
            { x: 0.4, z: 0.3 }
        ];
        strutPositions.forEach(function (pos) {
            const strut = new THREE.Mesh(strutGeo, materials.suspensionArm);
            strut.position.set(pos.x, -SOLAR_PANEL_H / 2 - SOLAR_PANEL_Y_OFFSET / 2, pos.z);
            strut.castShadow = true;
            panelGroup.add(strut);
        });

        return panelGroup;
    }

    /**
     * Creates the antenna mast with dish
     */
    function createAntenna() {
        const antennaGroup = new THREE.Group();

        // Mast
        const mastGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
        const mastMesh = new THREE.Mesh(mastGeo, materials.antenna);
        mastMesh.position.y = 0.3;
        mastMesh.castShadow = true;
        antennaGroup.add(mastMesh);

        // UHF antenna dish at top – flattened cone
        const dishGeo = new THREE.ConeGeometry(0.08, 0.04, 12);
        const dishMesh = new THREE.Mesh(dishGeo, materials.antenna);
        dishMesh.position.y = 0.62;
        dishMesh.rotation.x = Math.PI; // upside-down cone = dish shape
        dishMesh.castShadow = true;
        antennaGroup.add(dishMesh);

        // Small antenna rod above dish
        const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4);
        const rodMesh = new THREE.Mesh(rodGeo, materials.antenna);
        rodMesh.position.y = 0.7;
        antennaGroup.add(rodMesh);

        // Position on rear-right of body
        antennaGroup.position.set(
            -0.3,
            ROVER_BODY_H / 2,
            0.2
        );

        return antennaGroup;
    }

    /**
     * Creates the Pancam Mast Assembly (camera mast with twin cameras)
     */
    function createCameraMast() {
        const mastGroup = new THREE.Group();

        // Vertical mast
        const mastGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
        const mastMesh = new THREE.Mesh(mastGeo, materials.cameraMast);
        mastMesh.position.y = 0.25;
        mastMesh.castShadow = true;
        mastGroup.add(mastMesh);

        // Camera head housing
        const headGeo = new THREE.BoxGeometry(0.12, 0.06, 0.08);
        const headMesh = new THREE.Mesh(headGeo, materials.cameraMast);
        headMesh.position.y = 0.53;
        headMesh.castShadow = true;
        mastGroup.add(headMesh);

        // Two camera "eyes"
        const eyeGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(eyeGeo, materials.lens);
            eye.position.set(0.06, 0.53, side * 0.025);
            eye.castShadow = true;
            mastGroup.add(eye);
        }

        // Position on front of body
        mastGroup.position.set(
            0.35,
            ROVER_BODY_H / 2,
            0
        );

        return mastGroup;
    }

    /**
     * Creates the Instrument Deployment Device (IDD) – articulated arm
     */
    function createInstrumentArm() {
        const armGroup = new THREE.Group();
        armSegments = [];
        armJoints = [];

        // Shoulder joint
        const jointGeo = new THREE.SphereGeometry(0.035, 8, 8);
        const shoulderJoint = new THREE.Mesh(jointGeo, materials.armJoint);
        shoulderJoint.position.set(0, 0, 0);
        shoulderJoint.castShadow = true;
        armGroup.add(shoulderJoint);
        armJoints.push(shoulderJoint);

        // Upper arm segment
        const seg1Geo = new THREE.BoxGeometry(0.2, 0.03, 0.03);
        const seg1 = new THREE.Mesh(seg1Geo, materials.suspensionArm);
        seg1.position.set(0.1, 0, 0);
        seg1.castShadow = true;
        armGroup.add(seg1);
        armSegments.push(seg1);

        // Elbow joint
        const elbowJoint = new THREE.Mesh(jointGeo, materials.armJoint);
        elbowJoint.position.set(0.2, 0, 0);
        elbowJoint.castShadow = true;
        armGroup.add(elbowJoint);
        armJoints.push(elbowJoint);

        // Lower arm segment
        const seg2Geo = new THREE.BoxGeometry(0.18, 0.025, 0.025);
        const seg2 = new THREE.Mesh(seg2Geo, materials.suspensionArm);
        seg2.position.set(0.3, 0, 0);
        seg2.castShadow = true;
        armGroup.add(seg2);
        armSegments.push(seg2);

        // Wrist joint
        const wristJoint = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 8, 8), materials.armJoint
        );
        wristJoint.position.set(0.39, 0, 0);
        wristJoint.castShadow = true;
        armGroup.add(wristJoint);
        armJoints.push(wristJoint);

        // Tool head (small box at end)
        const toolGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const toolMesh = new THREE.Mesh(toolGeo, materials.cameraMast);
        toolMesh.position.set(0.43, 0, 0);
        toolMesh.castShadow = true;
        armGroup.add(toolMesh);
        armSegments.push(toolMesh);

        // Position on front-bottom of body, folded by default
        armGroup.position.set(
            ROVER_BODY_W / 2,
            -ROVER_BODY_H / 2 + 0.04,
            0
        );

        return armGroup;
    }

    /**
     * Updates arm segment positions based on armProgress (0 = folded, 1 = extended)
     */
    function updateArmPose(armGroup, progress) {
        // We'll animate positions via IK-like approach:
        // Folded (progress=0): arm segments tucked against body
        // Extended (progress=1): arm reaches forward and down

        var p = progress;

        // Shoulder joint stays fixed
        // armJoints[0] is at origin of armGroup

        // Upper arm rotates from folded-back to forward-down
        // Folded: pointing backward (-x) and down slightly
        // Extended: pointing forward-down
        var seg1AngleZ = THREE.MathUtils.lerp(Math.PI * 0.85, -0.3, p);
        var seg1Length = 0.2;

        // Compute end of upper arm
        var elbowX = Math.cos(seg1AngleZ) * seg1Length;
        var elbowY = Math.sin(seg1AngleZ) * seg1Length;

        // Position upper arm segment at midpoint
        armSegments[0].position.set(elbowX / 2, elbowY / 2, 0);
        armSegments[0].rotation.z = seg1AngleZ;

        // Elbow joint
        armJoints[1].position.set(elbowX, elbowY, 0);

        // Lower arm angle
        var seg2AngleZ = THREE.MathUtils.lerp(Math.PI * 0.9, -1.2, p);
        var seg2Length = 0.18;

        var wristX = elbowX + Math.cos(seg2AngleZ) * seg2Length;
        var wristY = elbowY + Math.sin(seg2AngleZ) * seg2Length;

        // Position lower arm segment
        armSegments[1].position.set(
            (elbowX + wristX) / 2,
            (elbowY + wristY) / 2,
            0
        );
        armSegments[1].rotation.z = seg2AngleZ;

        // Wrist joint
        armJoints[2].position.set(wristX, wristY, 0);

        // Tool head
        armSegments[2].position.set(wristX + 0.03, wristY - 0.02, 0);
    }

    /**
     * Creates rocker-bogie suspension arms for one side
     * side: -1 for left (negative Z), +1 for right (positive Z)
     */
    function createSuspensionArms(side) {
        var sideSign = side;
        var zPos = sideSign * 0.42;
        var armGroup = new THREE.Group();

        // ---- Rocker arm ----
        // Connects body pivot to rear wheel and to bogie pivot
        // Pivot point on body near middle wheel position
        var pivotX = -0.05;
        var pivotY = -ROVER_BODY_H / 2 + 0.02;

        // Rocker: from pivot to rear wheel
        var rearWheelX = -0.42;
        var rockerLength = Math.abs(rearWheelX - pivotX) + 0.05;
        var rockerGeo = new THREE.BoxGeometry(rockerLength, SUSPENSION_ARM_THICKNESS, SUSPENSION_ARM_THICKNESS);
        var rockerMesh = new THREE.Mesh(rockerGeo, materials.suspensionArm);
        rockerMesh.position.set(
            (pivotX + rearWheelX) / 2,
            pivotY,
            zPos
        );
        rockerMesh.castShadow = true;
        armGroup.add(rockerMesh);

        if (sideSign < 0) {
            rockerArms.left = rockerMesh;
        } else {
            rockerArms.right = rockerMesh;
        }

        // Vertical link from rocker pivot up to body
        var vertLinkGeo = new THREE.BoxGeometry(SUSPENSION_ARM_THICKNESS, 0.1, SUSPENSION_ARM_THICKNESS);
        var vertLink = new THREE.Mesh(vertLinkGeo, materials.suspensionArm);
        vertLink.position.set(pivotX, pivotY + 0.05, zPos);
        vertLink.castShadow = true;
        armGroup.add(vertLink);

        // ---- Bogie arm ----
        // Connects front and middle wheels
        var frontWheelX = 0.45;
        var middleWheelX = 0.0;
        var bogieLength = Math.abs(frontWheelX - middleWheelX) + 0.05;
        var bogieGeo = new THREE.BoxGeometry(bogieLength, SUSPENSION_ARM_THICKNESS, SUSPENSION_ARM_THICKNESS);
        var bogieMesh = new THREE.Mesh(bogieGeo, materials.suspensionArm);
        bogieMesh.position.set(
            (frontWheelX + middleWheelX) / 2,
            pivotY,
            zPos
        );
        bogieMesh.castShadow = true;
        armGroup.add(bogieMesh);

        if (sideSign < 0) {
            bogieArms.left = bogieMesh;
        } else {
            bogieArms.right = bogieMesh;
        }

        // Bogie pivot connection (vertical link from bogie to rocker pivot)
        var bPivotGeo = new THREE.BoxGeometry(SUSPENSION_ARM_THICKNESS, 0.06, SUSPENSION_ARM_THICKNESS);
        var bPivot = new THREE.Mesh(bPivotGeo, materials.suspensionArm);
        bPivot.position.set(pivotX + 0.1, pivotY + 0.03, zPos);
        bPivot.castShadow = true;
        armGroup.add(bPivot);

        return armGroup;
    }

    /**
     * Builds the complete rover model
     */
    function buildRover() {
        roverGroup = new THREE.Group();
        roverGroup.name = 'MarsRover';

        // Body (chassis, WEB, equipment deck, hazcams)
        var body = createBody();
        roverGroup.add(body);

        // Solar panel
        var solarPanel = createSolarPanel();
        roverGroup.add(solarPanel);

        // Antenna
        var antenna = createAntenna();
        roverGroup.add(antenna);

        // Camera mast
        var cameraMast = createCameraMast();
        roverGroup.add(cameraMast);

        // Instrument arm
        var instrumentArm = createInstrumentArm();
        roverGroup.add(instrumentArm);
        // Set initial folded pose
        updateArmPose(instrumentArm, 0);

        // Store arm group reference for animation
        roverGroup.userData.armGroup = instrumentArm;

        // Wheels and suspension
        wheels = [];
        for (var i = 0; i < wheelPositions.length; i++) {
            var wp = wheelPositions[i];
            var wheelMesh = createWheel();
            wheelMesh.position.set(wp.x, -ROVER_BODY_H / 2 - 0.02, wp.z);
            wheelMesh.castShadow = true;
            roverGroup.add(wheelMesh);

            wheels.push({
                mesh: wheelMesh,
                side: wp.side,
                row: wp.row,
                localX: wp.x,
                localZ: wp.z,
                currentHeight: 0,
                targetHeight: 0
            });
        }

        // Suspension arms
        var leftSuspension = createSuspensionArms(-1);
        roverGroup.add(leftSuspension);
        var rightSuspension = createSuspensionArms(1);
        roverGroup.add(rightSuspension);

        // Ensure all children cast/receive shadows
        roverGroup.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        return roverGroup;
    }

    // -----------------------------------------------------------------------
    // Physics & Terrain Following
    // -----------------------------------------------------------------------

    /**
     * Gets terrain height at a given world position from the terrain system
     */
    function getTerrainHeight(worldX, worldZ, terrainSystem) {
        if (terrainSystem && typeof terrainSystem.getHeightAt === 'function') {
            return terrainSystem.getHeightAt(worldX, worldZ);
        }
        return 0;
    }

    /**
     * Converts a local rover-space position to world position based on heading
     */
    function localToWorld(localX, localZ) {
        var cosH = Math.cos(heading);
        var sinH = Math.sin(heading);
        return {
            x: state.position.x + localX * cosH - localZ * sinH,
            z: state.position.z + localX * sinH + localZ * cosH
        };
    }

    /**
     * Updates terrain following for all 6 wheels and calculates body orientation
     */
    function updateTerrainFollowing(terrainSystem) {
        if (!terrainSystem) return;

        var wheelHeights = [];
        var leftHeights = [];
        var rightHeights = [];
        var frontHeights = [];
        var rearHeights = [];

        // Sample terrain height at each wheel's world position
        for (var i = 0; i < wheels.length; i++) {
            var w = wheels[i];
            var worldPos = localToWorld(w.localX, w.localZ);
            var h = getTerrainHeight(worldPos.x, worldPos.z, terrainSystem);

            w.targetHeight = h;
            // Smooth interpolation for wheel height
            w.currentHeight = THREE.MathUtils.lerp(w.currentHeight, w.targetHeight, BODY_LERP * 2);

            wheelHeights.push(w.currentHeight);

            if (w.side === 'left') leftHeights.push(w.currentHeight);
            else rightHeights.push(w.currentHeight);

            if (w.row === 'front') frontHeights.push(w.currentHeight);
            else if (w.row === 'rear') rearHeights.push(w.currentHeight);
        }

        // Average height for rover body
        var avgHeight = 0;
        for (var j = 0; j < wheelHeights.length; j++) {
            avgHeight += wheelHeights[j];
        }
        avgHeight /= wheelHeights.length;

        // Suspension offset (body rides above wheel centers)
        var suspensionOffset = WHEEL_RADIUS + ROVER_BODY_H / 2 + 0.05;
        var targetY = avgHeight + suspensionOffset;

        // Smooth vertical position
        state.position.y = THREE.MathUtils.lerp(state.position.y, targetY, BODY_LERP);
        roverGroup.position.y = state.position.y;

        // Calculate pitch (forward-back tilt)
        var avgFront = 0, avgRear = 0;
        for (var fi = 0; fi < frontHeights.length; fi++) avgFront += frontHeights[fi];
        avgFront /= Math.max(frontHeights.length, 1);
        for (var ri = 0; ri < rearHeights.length; ri++) avgRear += rearHeights[ri];
        avgRear /= Math.max(rearHeights.length, 1);

        // Distance between front and rear axles
        var axleDistance = Math.abs(wheelPositions[0].x - wheelPositions[4].x);
        var targetPitch = Math.atan2(avgFront - avgRear, axleDistance);
        // Clamp pitch
        targetPitch = THREE.MathUtils.clamp(targetPitch, -0.4, 0.4);

        // Calculate roll (left-right tilt)
        var avgLeft = 0, avgRight = 0;
        for (var li = 0; li < leftHeights.length; li++) avgLeft += leftHeights[li];
        avgLeft /= Math.max(leftHeights.length, 1);
        for (var rii = 0; rii < rightHeights.length; rii++) avgRight += rightHeights[rii];
        avgRight /= Math.max(rightHeights.length, 1);

        var trackWidth = Math.abs(wheelPositions[0].z - wheelPositions[1].z);
        var targetRoll = Math.atan2(avgLeft - avgRight, trackWidth);
        targetRoll = THREE.MathUtils.clamp(targetRoll, -0.3, 0.3);

        // Smooth body orientation – note: rotation order is YXZ for heading-pitch-roll
        roverGroup.rotation.order = 'YXZ';

        // We apply heading as Y rotation, pitch as rotation around local X (but relative to heading)
        // Use a quaternion approach for smooth interpolation
        var targetQuat = new THREE.Quaternion();
        var euler = new THREE.Euler(-targetPitch, heading, targetRoll, 'YXZ');
        targetQuat.setFromEuler(euler);

        roverGroup.quaternion.slerp(targetQuat, BODY_LERP);

        // Position wheels at their individual terrain heights relative to body
        for (var wi = 0; wi < wheels.length; wi++) {
            var wheel = wheels[wi];
            var wheelLocalY = wheel.currentHeight - state.position.y + WHEEL_RADIUS + 0.02;
            wheel.mesh.position.y = THREE.MathUtils.lerp(
                wheel.mesh.position.y,
                wheelLocalY,
                BODY_LERP * 1.5
            );
        }

        // Articulate suspension arms based on wheel heights
        updateSuspensionArms();
    }

    /**
     * Updates the visual articulation of rocker-bogie arms
     */
    function updateSuspensionArms() {
        // Left side: compute angles based on wheel heights
        if (rockerArms.left && wheels.length >= 6) {
            var leftMiddleY = wheels[2].mesh.position.y;
            var leftRearY = wheels[4].mesh.position.y;
            var leftFrontY = wheels[0].mesh.position.y;

            // Rocker arm tilt (connects mid/rear)
            var rockerAngle = Math.atan2(
                leftRearY - leftMiddleY,
                Math.abs(wheelPositions[4].x - wheelPositions[2].x)
            );
            rockerArms.left.rotation.z = rockerAngle * 0.5;
            rockerArms.left.position.y = (leftMiddleY + leftRearY) / 2;

            // Bogie arm tilt (connects front/mid)
            var bogieAngle = Math.atan2(
                leftFrontY - leftMiddleY,
                Math.abs(wheelPositions[0].x - wheelPositions[2].x)
            );
            bogieArms.left.rotation.z = bogieAngle * 0.5;
            bogieArms.left.position.y = (leftFrontY + leftMiddleY) / 2;
        }

        if (rockerArms.right && wheels.length >= 6) {
            var rightMiddleY = wheels[3].mesh.position.y;
            var rightRearY = wheels[5].mesh.position.y;
            var rightFrontY = wheels[1].mesh.position.y;

            var rockerAngleR = Math.atan2(
                rightRearY - rightMiddleY,
                Math.abs(wheelPositions[5].x - wheelPositions[3].x)
            );
            rockerArms.right.rotation.z = rockerAngleR * 0.5;
            rockerArms.right.position.y = (rightMiddleY + rightRearY) / 2;

            var bogieAngleR = Math.atan2(
                rightFrontY - rightMiddleY,
                Math.abs(wheelPositions[1].x - wheelPositions[3].x)
            );
            bogieArms.right.rotation.z = bogieAngleR * 0.5;
            bogieArms.right.position.y = (rightFrontY + rightMiddleY) / 2;
        }
    }

    /**
     * Animates wheel rotation based on speed and steering
     */
    function updateWheelAnimation(delta, steerInput) {
        var rotationAmount = (currentSpeed / WHEEL_RADIUS) * delta;

        for (var i = 0; i < wheels.length; i++) {
            var w = wheels[i];
            // Rotate wheel around its axle (local X axis after the Z-rotation applied in createWheel)
            // The wheel cylinder is rotated 90 deg on X, so rotation around Y is the roll
            w.mesh.children[0].rotation.y += rotationAmount;

            // Front wheels steer slightly
            if (w.row === 'front') {
                var targetSteer = steerInput * 0.3; // Max 0.3 rad visual steer
                w.mesh.rotation.y = THREE.MathUtils.lerp(
                    w.mesh.rotation.y,
                    targetSteer,
                    0.1
                );
            }
        }
    }

    /**
     * Checks collision with rocks from terrain system
     * Returns collision info or null
     */
    function checkRockCollisions(terrainSystem) {
        if (!terrainSystem || typeof terrainSystem.getRockColliders !== 'function') {
            return null;
        }

        var colliders = terrainSystem.getRockColliders();
        if (!colliders || colliders.length === 0) return null;

        var roverX = state.position.x;
        var roverZ = state.position.z;
        var roverR = COLLISION_RADIUS;

        for (var i = 0; i < colliders.length; i++) {
            var rock = colliders[i];
            var dx = roverX - rock.x;
            var dz = roverZ - rock.z;
            var dist = Math.sqrt(dx * dx + dz * dz);
            var minDist = roverR + (rock.radius || 0.5);

            if (dist < minDist) {
                // Collision detected
                var overlap = minDist - dist;
                var nx = dist > 0.001 ? dx / dist : 1;
                var nz = dist > 0.001 ? dz / dist : 0;
                return {
                    overlap: overlap,
                    normalX: nx,
                    normalZ: nz,
                    speed: Math.abs(currentSpeed),
                    rockX: rock.x,
                    rockZ: rock.z
                };
            }
        }

        return null;
    }

    /**
     * Handles collision response
     */
    function handleCollision(collision) {
        // Push rover away from rock
        state.position.x += collision.normalX * collision.overlap * 1.1;
        state.position.z += collision.normalZ * collision.overlap * 1.1;

        // Gentle collision: just stop
        if (collision.speed < 0.5) {
            currentSpeed = 0;
        } else {
            // Hard collision: stop + visual feedback + damage
            currentSpeed = -currentSpeed * 0.1; // tiny bounce-back

            if (collision.speed > 1.0) {
                // Apply damage (never go below 30)
                var damage = (collision.speed - 1.0) * 5;
                state.health = Math.max(30, state.health - damage);

                // Trigger visual feedback
                damageFlashTime = 0.3;
                shakeAmount = Math.min(1.0, (collision.speed - 1.0) * 0.5);
                shakeDuration = 0.4;
            } else {
                // Medium collision
                damageFlashTime = 0.15;
                shakeAmount = 0.2;
                shakeDuration = 0.2;
            }
        }

        state.isStuck = true;
    }

    /**
     * Updates damage flash visual on body material
     */
    function updateDamageFlash(delta) {
        if (damageFlashTime > 0) {
            damageFlashTime -= delta;
            if (bodyMesh) {
                // Lerp body color toward red during flash
                var flashIntensity = damageFlashTime / 0.3;
                bodyMesh.material.color.lerpColors(
                    new THREE.Color(0xB8A070),
                    new THREE.Color(0xCC5533),
                    Math.max(0, flashIntensity)
                );
            }
        } else {
            // Restore original color
            if (bodyMesh) {
                bodyMesh.material.color.lerp(new THREE.Color(0xB8A070), 0.1);
            }
        }

        // Decay shake
        if (shakeDuration > 0) {
            shakeDuration -= delta;
            if (shakeDuration <= 0) {
                shakeAmount = 0;
                shakeDuration = 0;
            } else {
                // Decay shake intensity
                shakeAmount *= 0.9;
            }
        }
    }

    /**
     * Updates battery cosmetic drain/recharge
     */
    function updateBattery(delta, isMoving) {
        if (isMoving) {
            // Slowly drain battery while moving
            state.batteryLevel = Math.max(10, state.batteryLevel - delta * 0.5);
        } else {
            // Recharge when stopped (simulating solar panels)
            state.batteryLevel = Math.min(100, state.batteryLevel + delta * 2.0);
        }
    }

    /**
     * Handles reset (R key) – smooth teleport to last safe position
     */
    function startReset() {
        if (isResetting) return;
        isResetting = true;
        resetProgress = 0;
        resetStartPos.set(state.position.x, state.position.y, state.position.z);
        resetTargetPos.copy(lastSafePosition);
        // Lift up a bit for the teleport
        currentSpeed = 0;
    }

    function updateReset(delta) {
        if (!isResetting) return;

        resetProgress += delta / 1.0; // 1 second to reset
        if (resetProgress >= 1.0) {
            resetProgress = 1.0;
            isResetting = false;
            state.isStuck = false;
        }

        // Smooth arc movement: up then to target
        var t = resetProgress;
        var easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad

        // Rise up first, then move laterally
        var liftHeight = 2.0 * Math.sin(t * Math.PI); // arc up and back down

        state.position.x = THREE.MathUtils.lerp(resetStartPos.x, resetTargetPos.x, easeT);
        state.position.z = THREE.MathUtils.lerp(resetStartPos.z, resetTargetPos.z, easeT);
        state.position.y = THREE.MathUtils.lerp(resetStartPos.y, resetTargetPos.y, easeT) + liftHeight;

        roverGroup.position.set(state.position.x, state.position.y, state.position.z);
    }

    /**
     * Updates arm animation state
     */
    function updateArmAnimation(delta) {
        var armSpeed = 1.0 / 1.5; // 1.5 seconds for full animation

        if (armState === 'extending') {
            armProgress = Math.min(1.0, armProgress + delta * armSpeed);
            if (armProgress >= 1.0) {
                armState = 'extended';
            }
        } else if (armState === 'retracting') {
            armProgress = Math.max(0.0, armProgress - delta * armSpeed);
            if (armProgress <= 0.0) {
                armState = 'retracted';
            }
        }

        // Update arm visual pose
        var armGroup = roverGroup.userData.armGroup;
        if (armGroup) {
            // Smooth the progress with easing
            var easedProgress = armProgress < 0.5
                ? 2 * armProgress * armProgress
                : 1 - Math.pow(-2 * armProgress + 2, 2) / 2;
            updateArmPose(armGroup, easedProgress);
        }
    }

    // -----------------------------------------------------------------------
    // Main API
    // -----------------------------------------------------------------------

    window.RoverSystem = {
        /**
         * Initializes the rover, creates the 3D model, adds to scene
         * @param {THREE.Scene} scene - The Three.js scene
         * @returns {THREE.Group} The rover group
         */
        init: function (scene) {
            createMaterials();
            buildRover();

            // Initial position
            roverGroup.position.set(0, 1, 0);
            state.position = { x: 0, y: 1, z: 0 };
            lastSafePosition.set(0, 1, 0);

            scene.add(roverGroup);

            return roverGroup;
        },

        /**
         * Main update loop – called every frame
         * @param {number} delta - Time since last frame in seconds
         * @param {Object} keys - Input state { forward, backward, left, right, brake, interact, reset }
         * @param {Object} terrainSystem - Terrain system for height queries and colliders
         * @returns {Object} Current rover state
         */
        update: function (delta, keys, terrainSystem) {
            // Clamp delta to prevent physics explosions
            delta = Math.min(delta, 0.1);

            // Handle reset
            if (keys && keys.reset) {
                startReset();
            }

            if (isResetting) {
                updateReset(delta);
                updateDamageFlash(delta);
                updateArmAnimation(delta);
                return this.getState();
            }

            // ---- Movement Physics ----
            var isMoving = false;
            var steerInput = 0;

            if (keys) {
                // Acceleration / deceleration
                if (keys.forward) {
                    currentSpeed += ACCELERATION * delta;
                    isMoving = true;
                } else if (keys.backward) {
                    currentSpeed -= ACCELERATION * 0.6 * delta; // Reverse is slower
                    isMoving = true;
                }

                // Braking
                if (keys.brake) {
                    if (currentSpeed > 0) {
                        currentSpeed = Math.max(0, currentSpeed - DECELERATION * delta);
                    } else if (currentSpeed < 0) {
                        currentSpeed = Math.min(0, currentSpeed + DECELERATION * delta);
                    }
                }

                // Steering (only effective when moving)
                if (keys.left) {
                    steerInput = 1;
                    if (Math.abs(currentSpeed) > 0.05) {
                        heading += TURN_SPEED * delta * Math.sign(currentSpeed);
                    }
                }
                if (keys.right) {
                    steerInput = -1;
                    if (Math.abs(currentSpeed) > 0.05) {
                        heading -= TURN_SPEED * delta * Math.sign(currentSpeed);
                    }
                }

                // Interact – extend/retract arm
                if (keys.interact) {
                    if (armState === 'retracted') {
                        armState = 'extending';
                    } else if (armState === 'extended') {
                        armState = 'retracting';
                    }
                }
            }

            // Apply friction when no input
            if (!keys || (!keys.forward && !keys.backward && !keys.brake)) {
                if (currentSpeed > 0) {
                    currentSpeed = Math.max(0, currentSpeed - FRICTION * delta);
                } else if (currentSpeed < 0) {
                    currentSpeed = Math.min(0, currentSpeed + FRICTION * delta);
                }
            }

            // Clamp speed
            currentSpeed = THREE.MathUtils.clamp(currentSpeed, -MAX_SPEED * 0.4, MAX_SPEED);

            // Scale max speed by health
            var healthFactor = 0.5 + (state.health / 100) * 0.5; // 50%-100% speed
            var effectiveMaxSpeed = MAX_SPEED * healthFactor;
            currentSpeed = THREE.MathUtils.clamp(currentSpeed, -effectiveMaxSpeed * 0.4, effectiveMaxSpeed);

            // ---- Position Update ----
            var moveX = Math.cos(heading) * currentSpeed * delta;
            var moveZ = Math.sin(heading) * currentSpeed * delta;

            state.position.x += moveX;
            state.position.z -= moveZ;

            // Track odometer
            state.odometer += Math.abs(currentSpeed) * delta;

            // ---- Collision Detection ----
            state.isStuck = false;
            var collision = checkRockCollisions(terrainSystem);
            if (collision) {
                handleCollision(collision);
            }

            // ---- Update Rover World Position ----
            roverGroup.position.x = state.position.x;
            roverGroup.position.z = state.position.z;

            // ---- Terrain Following ----
            updateTerrainFollowing(terrainSystem);

            // ---- Wheel Animation ----
            updateWheelAnimation(delta, steerInput);

            // ---- Damage Flash ----
            updateDamageFlash(delta);

            // ---- Battery ----
            updateBattery(delta, Math.abs(currentSpeed) > 0.1);

            // ---- Arm Animation ----
            updateArmAnimation(delta);

            // ---- Safe Position Update ----
            safePositionTimer += delta;
            if (safePositionTimer >= SAFE_POS_INTERVAL && Math.abs(currentSpeed) > 0.1) {
                safePositionTimer = 0;
                lastSafePosition.set(
                    state.position.x,
                    state.position.y,
                    state.position.z
                );
            }

            // ---- Update State ----
            state.speed = currentSpeed;
            state.heading = heading;

            return this.getState();
        },

        /**
         * Returns the current rover state object
         */
        getState: function () {
            return {
                health: state.health,
                batteryLevel: state.batteryLevel,
                speed: Math.abs(currentSpeed),
                position: {
                    x: state.position.x,
                    y: state.position.y,
                    z: state.position.z
                },
                heading: heading,
                isStuck: state.isStuck,
                odometer: state.odometer,
                armState: armState,
                isResetting: isResetting
            };
        },

        /**
         * Returns the rover's current world position as THREE.Vector3
         */
        getPosition: function () {
            return new THREE.Vector3(
                state.position.x,
                state.position.y,
                state.position.z
            );
        },

        /**
         * Returns the rover's current heading in radians
         */
        getHeading: function () {
            return heading;
        },

        /**
         * Returns the rover's THREE.Group for external use
         */
        getRoverGroup: function () {
            return roverGroup;
        },

        /**
         * Starts the arm extension animation
         */
        extendArm: function () {
            if (armState === 'retracted' || armState === 'retracting') {
                armState = 'extending';
            }
        },

        /**
         * Starts the arm retraction animation
         */
        retractArm: function () {
            if (armState === 'extended' || armState === 'extending') {
                armState = 'retracting';
            }
        },

        /**
         * Resets the rover to the last safe position
         */
        resetRover: function () {
            startReset();
        },

        /**
         * Returns the current camera shake intensity (0-1)
         */
        getShakeAmount: function () {
            return shakeAmount;
        },

        /**
         * Teleports the rover to a specific X, Z position
         * @param {number} x - World X position
         * @param {number} z - World Z position
         */
        setPosition: function (x, z) {
            state.position.x = x;
            state.position.z = z;
            currentSpeed = 0;

            if (roverGroup) {
                roverGroup.position.x = x;
                roverGroup.position.z = z;
            }

            // Update safe position
            lastSafePosition.set(x, state.position.y, z);
        }
    };
})();
