/**
 * AFTERLIGHT: Mars Rover — Main Game Controller
 * Orchestrates all game systems, manages game loop, and handles state transitions.
 */

(function() {
    'use strict';

    // ==================== GAME STATE ====================
    const GameState = {
        LOADING: 'loading',
        MAIN_MENU: 'main_menu',
        MISSION_BRIEFING: 'mission_briefing',
        PLAYING: 'playing',
        PAUSED: 'paused',
        INSPECTING: 'inspecting',
        EDUCATIONAL: 'educational',
        MISSION_COMPLETE: 'mission_complete'
    };

    let state = GameState.LOADING;
    let scene, renderer, clock;
    let keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        interact: false,
        reset: false
    };
    let gameInitialized = false;
    let currentInspectionTarget = null;
    let pendingEducationalCards = [];
    let moonModeActive = false;

    // Loading progress
    let loadProgress = 0;
    const loadSteps = [
        'Initializing renderer...',
        'Generating terrain...',
        'Placing geological features...',
        'Building rover systems...',
        'Loading mission data...',
        'Calibrating instruments...',
        'Establishing communication...',
        'Systems ready.'
    ];

    // ==================== INITIALIZATION ====================

    function updateLoadingBar(step, progress) {
        const bar = document.getElementById('loading-bar');
        const status = document.getElementById('loading-status');
        if (bar) bar.style.width = progress + '%';
        if (status) status.textContent = step;
    }

    async function initGame() {
        try {
            // Step 1: Create renderer
            updateLoadingBar(loadSteps[0], 5);
            await sleep(100);

            const container = document.getElementById('game-container');
            renderer = new THREE.WebGLRenderer({ 
                antialias: true, 
                alpha: false,
                powerPreference: 'high-performance'
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.9;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            container.appendChild(renderer.domElement);

            // Create scene
            scene = new THREE.Scene();
            clock = new THREE.Clock();

            // Step 2: Initialize terrain
            updateLoadingBar(loadSteps[1], 15);
            await sleep(50);
            window.TerrainSystem.init(scene);
            updateLoadingBar(loadSteps[2], 35);
            await sleep(50);

            // Step 3: Initialize rover
            updateLoadingBar(loadSteps[3], 50);
            await sleep(50);
            window.RoverSystem.init(scene);
            updateLoadingBar(loadSteps[4], 60);
            await sleep(50);

            // Step 4: Initialize missions
            updateLoadingBar(loadSteps[4], 65);
            await sleep(50);
            window.MissionSystem.init();

            // Step 5: Initialize camera
            updateLoadingBar(loadSteps[5], 75);
            await sleep(50);
            const camera = window.CameraSystem.init(scene, window.innerWidth / window.innerHeight);

            // Step 6: Initialize audio
            updateLoadingBar(loadSteps[6], 85);
            await sleep(50);
            window.AudioSystem.init();

            // Step 7: Initialize UI
            updateLoadingBar(loadSteps[6], 90);
            await sleep(50);
            window.UISystem.init();
            setupUICallbacks();

            // Step 8: Setup input
            setupInput();
            setupResize();

            updateLoadingBar(loadSteps[7], 100);
            await sleep(300);

            // Hide loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.classList.add('fade-out');
                setTimeout(() => loadingScreen.remove(), 800);
            }

            gameInitialized = true;

            // Position rover at origin initially
            window.RoverSystem.setPosition(0, 0);

            // Show main menu
            setState(GameState.MAIN_MENU);

            // Start game loop
            requestAnimationFrame(gameLoop);

        } catch (error) {
            console.error('Game initialization failed:', error);
            updateLoadingBar('ERROR: ' + error.message, 100);
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== INPUT HANDLING ====================

    function setupInput() {
        document.addEventListener('keydown', (e) => {
            // Initialize audio context on first interaction
            window.AudioSystem.ensureContext();

            if (state === GameState.PLAYING) {
                switch(e.code) {
                    case 'KeyW': case 'ArrowUp':    keys.forward = true; break;
                    case 'KeyS': case 'ArrowDown':  keys.backward = true; break;
                    case 'KeyA': case 'ArrowLeft':   keys.left = true; break;
                    case 'KeyD': case 'ArrowRight':  keys.right = true; break;
                    case 'Space':                    keys.brake = true; e.preventDefault(); break;
                    case 'KeyE':                     handleInteraction(); break;
                    case 'KeyR':                     window.RoverSystem.resetRover(); break;
                    case 'KeyC':                     toggleCamera(); break;
                    case 'KeyH':                     window.UISystem.toggleControlsHelp(); break;
                    case 'Escape':                   pauseGame(); break;
                }
            } else if (state === GameState.PAUSED) {
                if (e.code === 'Escape') resumeGame();
            } else if (state === GameState.MAIN_MENU || state === GameState.MISSION_BRIEFING) {
                // Audio context init on any key
            }
        });

        document.addEventListener('keyup', (e) => {
            switch(e.code) {
                case 'KeyW': case 'ArrowUp':    keys.forward = false; break;
                case 'KeyS': case 'ArrowDown':  keys.backward = false; break;
                case 'KeyA': case 'ArrowLeft':   keys.left = false; break;
                case 'KeyD': case 'ArrowRight':  keys.right = false; break;
                case 'Space':                    keys.brake = false; break;
            }
        });

        // Audio context on click
        document.addEventListener('click', () => {
            window.AudioSystem.ensureContext();
        }, { once: false });
    }

    // ==================== UI CALLBACKS ====================

    function setupUICallbacks() {
        window.UISystem.onStartMission = (missionId) => {
            startMission(missionId);
        };

        window.UISystem.onResume = () => {
            resumeGame();
        };

        window.UISystem.onRestart = () => {
            restartMission();
        };

        window.UISystem.onMainMenu = () => {
            returnToMainMenu();
        };

        window.UISystem.onNextMission = () => {
            const missions = window.MissionSystem.getMissions();
            const current = window.MissionSystem.getCurrentMission();
            if (current) {
                const idx = missions.findIndex(m => m.id === current.id);
                if (idx < missions.length - 1 && missions[idx + 1].unlocked) {
                    showMissionBriefing(missions[idx + 1].id);
                } else {
                    returnToMainMenu();
                }
            }
        };

        window.UISystem.onCameraToggle = () => {
            toggleCamera();
        };

        window.UISystem.onInspectionComplete = () => {
            completeInspection();
        };

        window.UISystem.onEducationalContinue = () => {
            hideEducationalCard();
        };
    }

    // ==================== STATE MANAGEMENT ====================

    function setState(newState) {
        const oldState = state;
        state = newState;
        console.log(`State: ${oldState} -> ${newState}`);
    }

    function startMission(missionId) {
        window.UISystem.hideMissionBriefing();
        window.UISystem.hideMainMenu();

        window.MissionSystem.startMission(missionId);
        const mission = window.MissionSystem.getCurrentMission();

        if (mission) {
            // Check moon mode
            moonModeActive = mission.isMoonMission || false;

            // Position rover at mission start
            window.RoverSystem.setPosition(mission.startPosition.x, mission.startPosition.z);

            // Setup checkpoints
            window.TerrainSystem.removeAllCheckpoints();
            if (mission.checkpoints) {
                mission.checkpoints.forEach(cp => {
                    window.TerrainSystem.createCheckpoint(cp.x, cp.z, cp.id);
                });
            }

            // Show HUD
            window.UISystem.showHUD();
            window.UISystem.showControlsHelp(); // Show controls on first mission
            setTimeout(() => window.UISystem.hideControlsHelp(), 5000);

            // Start audio
            window.AudioSystem.startWind();
            window.AudioSystem.startMotor();

            setState(GameState.PLAYING);
        }
    }

    function showMissionBriefing(missionId) {
        const missions = window.MissionSystem.getMissions();
        const mission = missions.find(m => m.id === missionId);
        if (mission) {
            window.UISystem.showMissionBriefing(mission);
            setState(GameState.MISSION_BRIEFING);
        }
    }

    function pauseGame() {
        if (state !== GameState.PLAYING) return;
        setState(GameState.PAUSED);
        window.UISystem.showPauseMenu();
        window.AudioSystem.stopMotor();
    }

    function resumeGame() {
        window.UISystem.hidePauseMenu();
        window.AudioSystem.startMotor();
        setState(GameState.PLAYING);
    }

    function restartMission() {
        window.UISystem.hidePauseMenu();
        window.UISystem.hideMissionComplete();
        const current = window.MissionSystem.getCurrentMission();
        if (current) {
            startMission(current.id);
        }
    }

    function returnToMainMenu() {
        window.UISystem.hidePauseMenu();
        window.UISystem.hideMissionComplete();
        window.UISystem.hideHUD();
        window.UISystem.hideInspectionPanel();
        window.UISystem.hideEducationalCard();
        window.AudioSystem.stopAll();

        const missions = window.MissionSystem.getMissions();
        window.UISystem.setMissionList(missions);
        window.UISystem.showMainMenu();
        setState(GameState.MAIN_MENU);
    }

    function handleInteraction() {
        if (state !== GameState.PLAYING) return;
        
        const roverPos = window.RoverSystem.getPosition();
        const target = window.MissionSystem.interactWithTarget(roverPos);
        
        if (target) {
            currentInspectionTarget = target;
            window.UISystem.showInspectionPanel(target);
            window.RoverSystem.extendArm();
            window.AudioSystem.playScanSound();
            setState(GameState.INSPECTING);
        }
    }

    function completeInspection() {
        window.UISystem.hideInspectionPanel();
        window.RoverSystem.retractArm();
        currentInspectionTarget = null;
        setState(GameState.PLAYING);
    }

    function showEducationalCard(card) {
        window.UISystem.showEducationalCard(card);
        setState(GameState.EDUCATIONAL);
    }

    function hideEducationalCard() {
        window.UISystem.hideEducationalCard();
        
        // Check for more pending cards
        if (pendingEducationalCards.length > 0) {
            const nextCard = pendingEducationalCards.shift();
            setTimeout(() => showEducationalCard(nextCard), 500);
        } else {
            // Check if mission just completed
            const mission = window.MissionSystem.getCurrentMission();
            if (mission && mission.completed) {
                showMissionComplete();
            } else {
                setState(GameState.PLAYING);
            }
        }
    }

    function showMissionComplete() {
        const score = window.MissionSystem.getScore();
        window.UISystem.showMissionComplete(score);
        window.AudioSystem.playMissionComplete();
        window.AudioSystem.stopMotor();
        window.MissionSystem.unlockNextMission();
        setState(GameState.MISSION_COMPLETE);
    }

    function toggleCamera() {
        const mode = window.CameraSystem.toggleMode();
        window.UISystem.showNotification(
            mode === 'close_follow' ? 'Close Follow Camera' : 'Third Person Camera', 
            'info'
        );
    }

    // ==================== GAME LOOP ====================

    function gameLoop() {
        requestAnimationFrame(gameLoop);

        const delta = Math.min(clock.getDelta(), 0.05); // Cap delta to prevent physics explosions
        const elapsed = clock.getElapsedTime();

        if (!gameInitialized) return;

        // Update terrain animations (always, for visual continuity)
        window.TerrainSystem.update(elapsed);

        if (state === GameState.PLAYING) {
            // Update rover physics
            const roverState = window.RoverSystem.update(delta, keys, window.TerrainSystem);
            
            // Camera shake from collisions
            const shake = window.RoverSystem.getShakeAmount();
            if (shake > 0.01) {
                window.CameraSystem.addShake(shake * 0.3);
            }

            // Update mission
            const events = window.MissionSystem.updateMission(roverState, window.TerrainSystem, delta);
            
            // Process mission events
            if (events && events.length > 0) {
                for (const event of events) {
                    switch(event.type) {
                        case 'objective_complete':
                            window.UISystem.showNotification('✓ ' + event.objective.text, 'success');
                            window.AudioSystem.playObjectiveComplete();
                            break;
                        case 'checkpoint_reached':
                            window.UISystem.showNotification('CHECKPOINT REACHED', 'info');
                            window.AudioSystem.playCheckpoint();
                            window.TerrainSystem.removeCheckpoint(event.checkpoint.id);
                            break;
                        case 'mission_complete':
                            // Queue educational card first if available
                            if (event.educationalCards && event.educationalCards.length > 0) {
                                pendingEducationalCards = [...event.educationalCards];
                                const firstCard = pendingEducationalCards.shift();
                                showEducationalCard(firstCard);
                            } else {
                                showMissionComplete();
                            }
                            break;
                        case 'educational_card':
                            pendingEducationalCards.push(event.card);
                            break;
                    }
                }
            }

            // Update HUD
            const missionState = window.MissionSystem.getCurrentMission();
            const heading = window.RoverSystem.getHeading();
            
            // Calculate distance to next objective
            let distToObj = 0;
            if (missionState) {
                const currentObj = missionState.objectives.find(o => !o.completed);
                if (currentObj && currentObj.targetPos) {
                    const rp = window.RoverSystem.getPosition();
                    distToObj = Math.sqrt(
                        Math.pow(rp.x - currentObj.targetPos.x, 2) + 
                        Math.pow(rp.z - currentObj.targetPos.z, 2)
                    );
                }
            }
            
            window.UISystem.updateHUD(roverState, missionState, heading, distToObj);

            // Check for interaction prompts
            const roverPos = window.RoverSystem.getPosition();
            const nearbyTarget = window.MissionSystem.interactWithTarget(roverPos);
            if (nearbyTarget) {
                window.UISystem.showInteractionPrompt('[E] Inspect ' + nearbyTarget.name);
            } else {
                window.UISystem.hideInteractionPrompt();
            }

            // Update audio
            window.AudioSystem.update(roverState.speed, 2.0);
        }

        // Update camera (always, for smooth transitions)
        if (state === GameState.PLAYING || state === GameState.PAUSED || 
            state === GameState.INSPECTING || state === GameState.EDUCATIONAL) {
            const roverPos = window.RoverSystem.getPosition();
            const roverHeading = window.RoverSystem.getHeading();
            window.CameraSystem.update(delta, roverPos, roverHeading, window.TerrainSystem);
        }

        // Render
        const camera = window.CameraSystem.getCamera();
        if (camera) {
            renderer.render(scene, camera);
        }
    }

    // ==================== RESIZE HANDLING ====================

    function setupResize() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            renderer.setSize(w, h);
            window.CameraSystem.resize(w, h);
        });
    }

    // ==================== START ====================

    // Wait for DOM and all scripts to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initGame, 100);
        });
    } else {
        setTimeout(initGame, 100);
    }

})();

