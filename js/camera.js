/**
 * AFTERLIGHT: Mars Rover — Camera System
 * Provides third-person and close-follow camera modes with smooth tracking.
 */

(function() {
    'use strict';

    const CAMERA_MODES = {
        THIRD_PERSON: 'third_person',
        CLOSE_FOLLOW: 'close_follow'
    };

    // Camera configuration per mode
    const CAMERA_CONFIG = {
        [CAMERA_MODES.THIRD_PERSON]: {
            distance: 12,
            height: 7,
            lookAheadDistance: 3,
            fov: 55,
            smoothing: 0.04,
            rotationSmoothing: 0.03,
            minDistance: 5,
            maxDistance: 25,
            minPitch: 0.1,    // Minimum pitch angle (radians) - don't go below terrain
            maxPitch: 1.3,    // Maximum pitch angle
        },
        [CAMERA_MODES.CLOSE_FOLLOW]: {
            distance: 5,
            height: 3,
            lookAheadDistance: 2,
            fov: 65,
            smoothing: 0.06,
            rotationSmoothing: 0.05,
            minDistance: 2.5,
            maxDistance: 10,
            minPitch: 0.1,
            maxPitch: 1.2,
        }
    };

    let camera = null;
    let currentMode = CAMERA_MODES.THIRD_PERSON;
    let config = CAMERA_CONFIG[currentMode];

    // Camera orbit state
    let orbitAngle = Math.PI;    // Horizontal angle around target (start behind rover)
    let orbitPitch = 0.5;        // Vertical angle
    let orbitDistance = config.distance;
    let targetOrbitDistance = config.distance;

    // Smooth position tracking
    let currentCameraPos = new THREE.Vector3(0, 10, 15);
    let currentLookAt = new THREE.Vector3(0, 0, 0);

    // Mouse state
    let isMouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseSensitivity = 0.003;

    // Shake
    let shakeIntensity = 0;
    let shakeDecay = 3.0;

    // Target tracking
    let targetPosition = new THREE.Vector3();
    let targetHeading = 0;
    let autoRotate = true; // Auto-rotate camera to follow rover heading when not manually rotating
    let autoRotateTimer = 0;
    const AUTO_ROTATE_DELAY = 2.0; // Seconds after mouse release before auto-rotate resumes

    function init(scene, aspect) {
        camera = new THREE.PerspectiveCamera(config.fov, aspect, 0.1, 1000);
        camera.position.copy(currentCameraPos);

        // Mouse controls
        document.addEventListener('mousedown', onMouseDown, false);
        document.addEventListener('mouseup', onMouseUp, false);
        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('wheel', onWheel, { passive: false });

        // Touch controls for mobile (basic)
        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchend', onTouchEnd, false);
        document.addEventListener('touchmove', onTouchMove, { passive: false });

        // Prevent context menu
        document.addEventListener('contextmenu', e => e.preventDefault());

        return camera;
    }

    function onMouseDown(e) {
        if (e.target.closest('#ui-overlay') && e.target.closest('[data-ui-interactive]')) return;
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        autoRotate = false;
        autoRotateTimer = 0;
    }

    function onMouseUp(e) {
        isMouseDown = false;
    }

    function onMouseMove(e) {
        if (!isMouseDown) return;

        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        orbitAngle -= dx * mouseSensitivity;
        orbitPitch += dy * mouseSensitivity;
        orbitPitch = Math.max(config.minPitch, Math.min(config.maxPitch, orbitPitch));
    }

    let lastTouchX = 0, lastTouchY = 0;
    function onTouchStart(e) {
        if (e.touches.length === 1) {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            isMouseDown = true;
            autoRotate = false;
            autoRotateTimer = 0;
        }
    }
    function onTouchEnd(e) {
        isMouseDown = false;
    }
    function onTouchMove(e) {
        if (e.touches.length === 1 && isMouseDown) {
            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            orbitAngle -= dx * mouseSensitivity * 2;
            orbitPitch += dy * mouseSensitivity * 2;
            orbitPitch = Math.max(config.minPitch, Math.min(config.maxPitch, orbitPitch));
            e.preventDefault();
        }
    }

    function onWheel(e) {
        e.preventDefault();
        targetOrbitDistance += e.deltaY * 0.01;
        targetOrbitDistance = Math.max(config.minDistance, Math.min(config.maxDistance, targetOrbitDistance));
    }

    function setMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;
        config = CAMERA_CONFIG[currentMode];
        targetOrbitDistance = config.distance;
        if (camera) {
            camera.fov = config.fov;
            camera.updateProjectionMatrix();
        }
    }

    function toggleMode() {
        if (currentMode === CAMERA_MODES.THIRD_PERSON) {
            setMode(CAMERA_MODES.CLOSE_FOLLOW);
        } else {
            setMode(CAMERA_MODES.THIRD_PERSON);
        }
        return currentMode;
    }

    function addShake(intensity) {
        shakeIntensity = Math.min(1.0, shakeIntensity + intensity);
    }

    function update(delta, roverPosition, roverHeading, terrainSystem) {
        if (!camera) return;

        targetPosition.copy(roverPosition);
        targetHeading = roverHeading;

        // Auto-rotate timer
        if (!isMouseDown) {
            autoRotateTimer += delta;
            if (autoRotateTimer > AUTO_ROTATE_DELAY) {
                autoRotate = true;
            }
        }

        // Auto-rotate: smoothly rotate camera to be behind rover
        if (autoRotate) {
            const targetAngle = roverHeading + Math.PI;
            // Shortest path rotation
            let angleDiff = targetAngle - orbitAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            orbitAngle += angleDiff * config.rotationSmoothing;
        }

        // Smooth zoom
        orbitDistance += (targetOrbitDistance - orbitDistance) * 0.08;

        // Calculate desired camera position
        const horizontalDist = orbitDistance * Math.cos(orbitPitch);
        const verticalDist = orbitDistance * Math.sin(orbitPitch);

        const desiredX = targetPosition.x + horizontalDist * Math.sin(orbitAngle);
        const desiredZ = targetPosition.z + horizontalDist * Math.cos(orbitAngle);
        let desiredY = targetPosition.y + verticalDist + config.height * 0.3;

        // Ensure camera stays above terrain
        if (terrainSystem) {
            const terrainH = terrainSystem.getHeightAt(desiredX, desiredZ);
            desiredY = Math.max(desiredY, terrainH + 1.5);
        }

        // Smooth camera position
        currentCameraPos.x += (desiredX - currentCameraPos.x) * config.smoothing;
        currentCameraPos.y += (desiredY - currentCameraPos.y) * config.smoothing;
        currentCameraPos.z += (desiredZ - currentCameraPos.z) * config.smoothing;

        // Look-at point (slightly ahead of rover)
        const lookX = targetPosition.x + Math.sin(roverHeading) * config.lookAheadDistance;
        const lookZ = targetPosition.z + Math.cos(roverHeading) * config.lookAheadDistance;
        const lookY = targetPosition.y + 0.5;

        currentLookAt.x += (lookX - currentLookAt.x) * config.smoothing * 1.5;
        currentLookAt.y += (lookY - currentLookAt.y) * config.smoothing * 1.5;
        currentLookAt.z += (lookZ - currentLookAt.z) * config.smoothing * 1.5;

        // Apply shake
        let shakeX = 0, shakeY = 0, shakeZ = 0;
        if (shakeIntensity > 0.01) {
            shakeX = (Math.random() - 0.5) * shakeIntensity * 0.3;
            shakeY = (Math.random() - 0.5) * shakeIntensity * 0.15;
            shakeZ = (Math.random() - 0.5) * shakeIntensity * 0.3;
            shakeIntensity *= Math.pow(1.0 - shakeDecay * delta, 1);
            if (shakeIntensity < 0.01) shakeIntensity = 0;
        }

        camera.position.set(
            currentCameraPos.x + shakeX,
            currentCameraPos.y + shakeY,
            currentCameraPos.z + shakeZ
        );
        camera.lookAt(currentLookAt);
    }

    function resize(width, height) {
        if (!camera) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    function getCamera() {
        return camera;
    }

    function getMode() {
        return currentMode;
    }

    // Expose API
    window.CameraSystem = {
        init,
        update,
        resize,
        getCamera,
        toggleMode,
        setMode,
        getMode,
        addShake,
        MODES: CAMERA_MODES
    };

})();

