// ============================================================
// AFTERLIGHT — Mission System
// Manages all game missions, objectives, progression, and scoring
// ============================================================

(function () {
    'use strict';

    // ---------------------------------------------------------
    // Educational card content
    // ---------------------------------------------------------
    const EDUCATIONAL_CARDS = {
        mission_01: {
            title: "Sojourner's Six Wheels",
            content: "Mars rovers use six wheels with a rocker-bogie suspension system — a design that lets each wheel independently climb obstacles as tall as the wheel itself. Unlike a car's rigid axles, the rocker-bogie linkage keeps all six wheels on the ground even on highly uneven terrain, distributing the rover's weight and preventing tip-overs. NASA's Sojourner was the first rover to prove this system on Mars in 1997, and every NASA Mars rover since — Spirit, Opportunity, Curiosity, and Perseverance — has used the same ingenious design.",
            fact: "The rocker-bogie system has no springs or axles — it relies purely on geometry to keep all six wheels grounded."
        },
        mission_02: {
            title: "Navigating Mars",
            content: "Planning a safe route on Mars is a daily challenge. Each sol (Martian day), rover drivers on Earth study stereo images taken by the rover's navigation cameras to build 3D terrain maps. Software evaluates slopes, rock sizes, and soil properties to determine which paths are safe. Because radio signals take 4 to 24 minutes to travel between Earth and Mars, the rover must execute most drives autonomously using its onboard hazard-avoidance cameras (hazcams) and auto-navigation algorithms.",
            fact: "Curiosity's autonomous driving software can evaluate over 600,000 possible paths to find the safest route forward."
        },
        mission_03: {
            title: "Rock Analysis on Mars",
            content: "Mars rovers carry miniature geology labs. The Alpha Particle X-Ray Spectrometer (APXS) bombards rock surfaces with alpha particles and X-rays, measuring the energy of particles that bounce back to determine chemical composition. Perseverance's SHERLOC instrument uses an ultraviolet laser to search for organic molecules — potential signs of ancient life. The rover's cameras also capture microscopic images showing individual mineral grains, giving scientists on Earth the next-best thing to holding the rock in their hands.",
            fact: "Perseverance is collecting rock core samples in titanium tubes that a future mission will return to Earth — the first Mars sample return."
        },
        mission_04: {
            title: "Talking to Earth",
            content: "Communicating with a rover on Mars requires NASA's Deep Space Network (DSN) — three giant antenna complexes spaced equally around Earth in California, Spain, and Australia so at least one always faces Mars. Signals travel at the speed of light but still take between 4 and 24 minutes one way depending on orbital positions. Rovers typically relay data through orbiters like the Mars Reconnaissance Orbiter, which can transfer data up to 10 times faster than a direct-to-Earth link.",
            fact: "The entire data Curiosity sends back in one sol would barely fill a single smartphone photo — bandwidth on Mars is precious."
        },
        mission_05: {
            title: "NASA on the Moon",
            content: "During Apollo 15, 16, and 17, astronauts drove the Lunar Roving Vehicle (LRV) — an electric car built by Boeing that folded up like origami to fit inside the Lunar Module. Powered by two 36-volt batteries, it could reach 13 km/h on the Moon's low-gravity surface. Equipment left on the Moon includes retroreflectors that scientists still bounce lasers off today to measure the Earth–Moon distance with millimeter accuracy, seismometers that detected moonquakes, and flags, tools, and even a family photo left by astronaut Charlie Duke.",
            fact: "The three LRVs are still parked on the Moon — they remain property of the U.S. government."
        }
    };

    // ---------------------------------------------------------
    // Mission definitions
    // ---------------------------------------------------------
    function createMissions() {
        return [
            {
                id: "mission_01",
                title: "FIRST CONTACT",
                subtitle: "Learn Rover Operations",
                description: "Welcome to Mars. Your rover has just touched down on the red planet's surface. Learn how to operate your vehicle — start the engines, practice driving, and navigate to your first checkpoint. This introductory mission will prepare you for the challenges ahead.",
                objectives: [
                    { id: "obj_01_1", text: "Activate rover systems", type: "action", actionKey: "movement", completed: false },
                    { id: "obj_01_2", text: "Drive forward 15 meters", type: "distance", target: 15, progress: 0, completed: false },
                    { id: "obj_01_3", text: "Practice turning — turn left and right", type: "turn_both", turnedLeft: false, turnedRight: false, completed: false },
                    { id: "obj_01_4", text: "Navigate around the training rocks", type: "checkpoint", checkpointId: "cp_01_2", completed: false },
                    { id: "obj_01_5", text: "Reach Checkpoint Alpha", type: "checkpoint", checkpointId: "cp_01_3", completed: false }
                ],
                checkpoints: [
                    { x: 15, z: 0, id: "cp_01_1", reached: false, radius: 6 },
                    { x: 25, z: 15, id: "cp_01_2", reached: false, radius: 6 },
                    { x: 40, z: 30, id: "cp_01_3", reached: false, radius: 6 }
                ],
                startPosition: { x: 0, z: 0 },
                educationalCards: [EDUCATIONAL_CARDS.mission_01],
                completed: false,
                unlocked: true,
                isMoonMission: false,
                score: { exploration: 0, accuracy: 0, safety: 0, discovery: 0 }
            },
            {
                id: "mission_02",
                title: "THE ROCKY PATH",
                subtitle: "Hazard Navigation",
                description: "Your first real test awaits. A field of boulders and a shallow crater stand between you and the geological formation ahead. Navigate carefully — your rover's health is precious, and there are no repair shops on Mars.",
                objectives: [
                    { id: "obj_02_1", text: "Head toward the geological formation", type: "checkpoint", checkpointId: "cp_02_1", completed: false },
                    { id: "obj_02_2", text: "Navigate around Boulder Field Alpha", type: "checkpoint", checkpointId: "cp_02_2", completed: false },
                    { id: "obj_02_3", text: "Cross the shallow crater", type: "checkpoint", checkpointId: "cp_02_2", completed: false },
                    { id: "obj_02_4", text: "Maintain rover health above 70%", type: "health_threshold", threshold: 70, completed: false, failed: false },
                    { id: "obj_02_5", text: "Reach Checkpoint Bravo", type: "checkpoint", checkpointId: "cp_02_3", completed: false }
                ],
                checkpoints: [
                    { x: 55, z: 40, id: "cp_02_1", reached: false, radius: 8 },
                    { x: 75, z: 60, id: "cp_02_2", reached: false, radius: 8 },
                    { x: 100, z: 80, id: "cp_02_3", reached: false, radius: 8 }
                ],
                startPosition: { x: 40, z: 30 },
                educationalCards: [EDUCATIONAL_CARDS.mission_02],
                completed: false,
                unlocked: false,
                isMoonMission: false,
                score: { exploration: 0, accuracy: 0, safety: 0, discovery: 0 }
            },
            {
                id: "mission_03",
                title: "SCIENTIFIC DISCOVERY",
                subtitle: "Rock Sample Analysis",
                description: "Scientists on Earth have identified a rock formation of great interest near your location. Navigate to the site, approach the target rock carefully, and deploy your instruments for analysis. Precision is key — this is what we came to Mars for.",
                objectives: [
                    { id: "obj_03_1", text: "Navigate to the rock sample site", type: "checkpoint", checkpointId: "cp_03_1", completed: false },
                    { id: "obj_03_2", text: "Approach target rock carefully", type: "approach", targetX: 130, targetZ: 110, maxSpeed: 0.3, range: 5, completed: false },
                    { id: "obj_03_3", text: "Position rover within inspection range", type: "proximity", targetX: 130, targetZ: 110, range: 3, completed: false },
                    { id: "obj_03_4", text: "Deploy instruments and inspect the rock", type: "interact", targetX: 130, targetZ: 110, range: 5, completed: false },
                    { id: "obj_03_5", text: "Review scientific findings", type: "auto_after_interact", triggeredBy: "obj_03_4", completed: false }
                ],
                checkpoints: [
                    { x: 115, z: 95, id: "cp_03_1", reached: false, radius: 8 },
                    { x: 130, z: 110, id: "cp_03_2", reached: false, radius: 5 }
                ],
                startPosition: { x: 100, z: 80 },
                educationalCards: [EDUCATIONAL_CARDS.mission_03],
                completed: false,
                unlocked: false,
                isMoonMission: false,
                inspectionTarget: {
                    name: "Basalt Formation RK-7",
                    type: "Volcanic Basalt",
                    x: 130, z: 110,
                    analysisData: {
                        iron: 78,
                        silicon: 62,
                        magnesium: 45,
                        calcium: 33,
                        sulfur: 21,
                        chlorine: 12
                    },
                    description: "Dense volcanic basalt with high iron content. Micro-vesicles suggest formation in a low-pressure environment consistent with Martian atmospheric conditions. Faint traces of hydrated minerals indicate past water interaction."
                },
                score: { exploration: 0, accuracy: 0, safety: 0, discovery: 0 }
            },
            {
                id: "mission_04",
                title: "THE LOST SIGNAL",
                subtitle: "Remote Exploration",
                description: "A faint signal has been detected from a remote exploration site deep in the Martian terrain. Follow navigation beacons through challenging terrain, choose your route through the canyon, and reach the signal source. This is the ultimate test of your rover skills.",
                objectives: [
                    { id: "obj_04_1", text: "Follow the navigation beacons", type: "checkpoint", checkpointId: "cp_04_1", completed: false },
                    { id: "obj_04_2", text: "Choose your route through the canyon", type: "checkpoint", checkpointId: "cp_04_2", completed: false },
                    { id: "obj_04_3", text: "Navigate the challenging terrain", type: "checkpoint", checkpointId: "cp_04_3", completed: false },
                    { id: "obj_04_4", text: "Reach the remote exploration site", type: "checkpoint", checkpointId: "cp_04_4", completed: false },
                    { id: "obj_04_5", text: "Complete the Mars exploration mission", type: "all_checkpoints", completed: false }
                ],
                checkpoints: [
                    { x: 150, z: 130, id: "cp_04_1", reached: false, radius: 8 },
                    { x: 170, z: 145, id: "cp_04_2", reached: false, radius: 10 },
                    { x: 185, z: 160, id: "cp_04_3", reached: false, radius: 8 },
                    { x: 200, z: 170, id: "cp_04_4", reached: false, radius: 8 }
                ],
                startPosition: { x: 130, z: 110 },
                educationalCards: [EDUCATIONAL_CARDS.mission_04],
                completed: false,
                unlocked: false,
                isMoonMission: false,
                score: { exploration: 0, accuracy: 0, safety: 0, discovery: 0 }
            },
            {
                id: "mission_05",
                title: "LUNAR EXPEDITION",
                subtitle: "Moon Mode — Bonus Mission",
                description: "Bonus mission unlocked! Travel back in time and across space to Earth's Moon. Explore the lunar highlands, investigate abandoned Apollo-era equipment, and collect lunar soil data before returning to base camp.",
                objectives: [
                    { id: "obj_05_1", text: "Activate lunar rover systems", type: "action", actionKey: "movement", completed: false },
                    { id: "obj_05_2", text: "Explore the lunar highlands", type: "checkpoint", checkpointId: "cp_05_1", completed: false },
                    { id: "obj_05_3", text: "Investigate the abandoned equipment site", type: "checkpoint", checkpointId: "cp_05_2", completed: false },
                    { id: "obj_05_4", text: "Collect lunar soil data", type: "interact", targetX: 60, targetZ: 50, range: 5, completed: false },
                    { id: "obj_05_5", text: "Return to base camp", type: "proximity", targetX: 0, targetZ: 0, range: 8, completed: false }
                ],
                checkpoints: [
                    { x: 30, z: 25, id: "cp_05_1", reached: false, radius: 8 },
                    { x: 60, z: 50, id: "cp_05_2", reached: false, radius: 8 }
                ],
                startPosition: { x: 0, z: 0 },
                educationalCards: [EDUCATIONAL_CARDS.mission_05],
                completed: false,
                unlocked: false,
                isMoonMission: true,
                inspectionTarget: {
                    name: "Lunar Regolith Sample",
                    type: "Lunar Soil",
                    x: 60, z: 50,
                    analysisData: {
                        silicon: 85,
                        aluminum: 70,
                        calcium: 55,
                        iron: 40,
                        titanium: 30,
                        magnesium: 25
                    },
                    description: "Fine-grained lunar regolith composed primarily of fragmented minerals and glass beads. Analysis shows high silicon and aluminum content typical of the lunar highlands. Helium-3 traces detected — a potential future energy source."
                },
                score: { exploration: 0, accuracy: 0, safety: 0, discovery: 0 }
            }
        ];
    }

    // ---------------------------------------------------------
    // Internal state
    // ---------------------------------------------------------
    let missions = [];
    let currentMissionId = null;
    let collisionCount = 0;
    let missionStartTime = 0;
    let exploredCells = {};       // "gx_gz" → true
    const CELL_SIZE = 4;          // grid cell size for exploration tracking
    let totalOdometer = 0;
    let inspectionDone = false;

    // ---------------------------------------------------------
    // Helper utilities
    // ---------------------------------------------------------
    function dist2D(ax, az, bx, bz) {
        var dx = ax - bx;
        var dz = az - bz;
        return Math.sqrt(dx * dx + dz * dz);
    }

    function cellKey(x, z) {
        var gx = Math.floor(x / CELL_SIZE);
        var gz = Math.floor(z / CELL_SIZE);
        return gx + "_" + gz;
    }

    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    function deepCloneMissions(src) {
        return JSON.parse(JSON.stringify(src));
    }

    // ---------------------------------------------------------
    // Scoring helpers
    // ---------------------------------------------------------
    function computeExplorationScore() {
        var keys = Object.keys(exploredCells);
        // Estimate total explorable cells based on mission area
        var mission = getMissionById(currentMissionId);
        if (!mission) return 0;
        var maxDist = 0;
        mission.checkpoints.forEach(function (cp) {
            var d = dist2D(mission.startPosition.x, mission.startPosition.z, cp.x, cp.z);
            if (d > maxDist) maxDist = d;
        });
        // Rough expected cells within bounding circle
        var radius = maxDist + 20;
        var expectedCells = Math.max(30, Math.PI * (radius / CELL_SIZE) * (radius / CELL_SIZE) * 0.3);
        var ratio = clamp(keys.length / expectedCells, 0, 1);
        return Math.round(ratio * 300);
    }

    function computeAccuracyScore() {
        // Fewer collisions = higher score
        if (collisionCount === 0) return 300;
        if (collisionCount <= 2) return 250;
        if (collisionCount <= 5) return 180;
        if (collisionCount <= 10) return 100;
        return Math.max(0, 300 - collisionCount * 25);
    }

    function computeSafetyScore(health) {
        // health is 0–100
        return Math.round((clamp(health, 0, 100) / 100) * 200);
    }

    function computeDiscoveryBonus(mission) {
        var completedCount = 0;
        mission.objectives.forEach(function (obj) {
            if (obj.completed) completedCount++;
        });
        var ratio = completedCount / mission.objectives.length;
        return Math.round(ratio * 200);
    }

    function letterGrade(total) {
        if (total >= 950) return "S";
        if (total >= 800) return "A";
        if (total >= 600) return "B";
        return "C";
    }

    // ---------------------------------------------------------
    // Mission lookup
    // ---------------------------------------------------------
    function getMissionById(id) {
        for (var i = 0; i < missions.length; i++) {
            if (missions[i].id === id) return missions[i];
        }
        return null;
    }

    function getMissionIndex(id) {
        for (var i = 0; i < missions.length; i++) {
            if (missions[i].id === id) return i;
        }
        return -1;
    }

    // ---------------------------------------------------------
    // Find the first incomplete objective (sequential)
    // ---------------------------------------------------------
    function getActiveObjective(mission) {
        for (var i = 0; i < mission.objectives.length; i++) {
            if (!mission.objectives[i].completed) return mission.objectives[i];
        }
        return null;
    }

    // ---------------------------------------------------------
    // Public API
    // ---------------------------------------------------------
    window.MissionSystem = {

        /**
         * Initialise / reset the mission system.
         */
        init: function () {
            missions = createMissions();
            currentMissionId = null;
            collisionCount = 0;
            missionStartTime = 0;
            exploredCells = {};
            totalOdometer = 0;
            inspectionDone = false;

            // Load saved progress if available
            try {
                var saved = localStorage.getItem("afterlight_progress");
                if (saved) {
                    var data = JSON.parse(saved);
                    if (data.unlockedMissions) {
                        data.unlockedMissions.forEach(function (id) {
                            var m = getMissionById(id);
                            if (m) m.unlocked = true;
                        });
                    }
                    if (data.completedMissions) {
                        data.completedMissions.forEach(function (id) {
                            var m = getMissionById(id);
                            if (m) {
                                m.completed = true;
                                m.unlocked = true;
                            }
                        });
                    }
                }
            } catch (e) {
                // Ignore storage errors
            }
        },

        /**
         * Return all mission data (cloned for safety).
         */
        getMissions: function () {
            return deepCloneMissions(missions);
        },

        /**
         * Return the current active mission object (mutable internal reference).
         */
        getCurrentMission: function () {
            if (!currentMissionId) return null;
            return getMissionById(currentMissionId);
        },

        /**
         * Begin a mission.
         */
        startMission: function (missionId) {
            var mission = getMissionById(missionId);
            if (!mission) return;
            currentMissionId = missionId;
            collisionCount = 0;
            missionStartTime = performance.now();
            exploredCells = {};
            totalOdometer = 0;
            inspectionDone = false;

            // Reset objectives & checkpoints
            mission.objectives.forEach(function (obj) {
                obj.completed = false;
                if (obj.progress !== undefined) obj.progress = 0;
                if (obj.turnedLeft !== undefined) obj.turnedLeft = false;
                if (obj.turnedRight !== undefined) obj.turnedRight = false;
                if (obj.failed !== undefined) obj.failed = false;
            });
            mission.checkpoints.forEach(function (cp) {
                cp.reached = false;
            });
            mission.completed = false;
            mission.score = { exploration: 0, accuracy: 0, safety: 0, discovery: 0 };
        },

        /**
         * Called every frame with the current rover state.
         *
         * @param {Object} roverState  { x, z, speed, maxSpeed, health, heading, turnLeft, turnRight, collided }
         * @param {Object} terrainSystem  (unused currently, reserved)
         * @param {number} delta  Seconds since last frame
         * @returns {Array} events  List of event objects
         */
        updateMission: function (roverState, terrainSystem, delta) {
            var events = [];
            var mission = getMissionById(currentMissionId);
            if (!mission || mission.completed) return events;

            // --- Track exploration grid ---
            var key = cellKey(roverState.x, roverState.z);
            exploredCells[key] = true;

            // --- Track odometer ---
            totalOdometer += Math.abs(roverState.speed) * delta;

            // --- Track collisions ---
            if (roverState.collided) {
                collisionCount++;
            }

            // --- Checkpoint proximity check ---
            mission.checkpoints.forEach(function (cp) {
                if (cp.reached) return;
                var d = dist2D(roverState.x, roverState.z, cp.x, cp.z);
                if (d <= (cp.radius || 6)) {
                    cp.reached = true;
                    events.push({ type: "checkpoint_reached", checkpoint: { x: cp.x, z: cp.z, id: cp.id } });
                }
            });

            // --- Process objectives sequentially ---
            var activeObj = getActiveObjective(mission);
            if (!activeObj) return events;

            var justCompleted = false;

            switch (activeObj.type) {
                case "action":
                    // Complete when any movement key is pressed (speed > 0)
                    if (Math.abs(roverState.speed) > 0.01) {
                        justCompleted = true;
                    }
                    break;

                case "distance":
                    activeObj.progress = totalOdometer;
                    if (totalOdometer >= activeObj.target) {
                        justCompleted = true;
                    }
                    break;

                case "turn_both":
                    if (roverState.turnLeft) activeObj.turnedLeft = true;
                    if (roverState.turnRight) activeObj.turnedRight = true;
                    if (activeObj.turnedLeft && activeObj.turnedRight) {
                        justCompleted = true;
                    }
                    break;

                case "checkpoint":
                    // Check if the corresponding checkpoint has been reached
                    var cp = null;
                    for (var c = 0; c < mission.checkpoints.length; c++) {
                        if (mission.checkpoints[c].id === activeObj.checkpointId) {
                            cp = mission.checkpoints[c];
                            break;
                        }
                    }
                    if (cp && cp.reached) {
                        justCompleted = true;
                    }
                    break;

                case "health_threshold":
                    // This objective stays "completed" as long as health is above threshold
                    // It completes (locks in) when the NEXT objective completes
                    if (roverState.health >= activeObj.threshold) {
                        justCompleted = true;
                    }
                    break;

                case "approach":
                    // Get within range at low speed
                    var ad = dist2D(roverState.x, roverState.z, activeObj.targetX, activeObj.targetZ);
                    if (ad <= activeObj.range && Math.abs(roverState.speed) <= activeObj.maxSpeed) {
                        justCompleted = true;
                    }
                    break;

                case "proximity":
                    var pd = dist2D(roverState.x, roverState.z, activeObj.targetX, activeObj.targetZ);
                    if (pd <= activeObj.range) {
                        justCompleted = true;
                    }
                    break;

                case "interact":
                    // Completed externally via interactWithTarget()
                    break;

                case "auto_after_interact":
                    // Completes immediately after the triggering objective
                    var trigger = null;
                    mission.objectives.forEach(function (o) {
                        if (o.id === activeObj.triggeredBy) trigger = o;
                    });
                    if (trigger && trigger.completed) {
                        justCompleted = true;
                    }
                    break;

                case "all_checkpoints":
                    var allReached = true;
                    mission.checkpoints.forEach(function (cp) {
                        if (!cp.reached) allReached = false;
                    });
                    if (allReached) {
                        justCompleted = true;
                    }
                    break;
            }

            if (justCompleted && !activeObj.completed) {
                activeObj.completed = true;
                events.push({ type: "objective_complete", objective: { id: activeObj.id, text: activeObj.text } });

                // Check if all objectives are now complete
                var allDone = true;
                mission.objectives.forEach(function (o) {
                    if (!o.completed) allDone = false;
                });

                if (allDone) {
                    mission.completed = true;

                    // Compute scores
                    mission.score.exploration = computeExplorationScore();
                    mission.score.accuracy = computeAccuracyScore();
                    mission.score.safety = computeSafetyScore(roverState.health);
                    mission.score.discovery = computeDiscoveryBonus(mission);

                    // Show educational card first
                    if (mission.educationalCards && mission.educationalCards.length > 0) {
                        events.push({ type: "educational_card", card: mission.educationalCards[0] });
                    }

                    events.push({ type: "mission_complete" });

                    // Save progress
                    this.unlockNextMission();
                    this._saveProgress();
                }
            }

            return events;
        },

        /**
         * Force-complete the current mission (debug / skip).
         */
        completeMission: function () {
            var mission = getMissionById(currentMissionId);
            if (!mission) return;
            mission.objectives.forEach(function (o) { o.completed = true; });
            mission.checkpoints.forEach(function (cp) { cp.reached = true; });
            mission.completed = true;
            mission.score.exploration = 200;
            mission.score.accuracy = 200;
            mission.score.safety = 150;
            mission.score.discovery = 200;
            this.unlockNextMission();
            this._saveProgress();
        },

        /**
         * Return the score object for the current or given mission.
         */
        getScore: function (missionId) {
            var m = getMissionById(missionId || currentMissionId);
            if (!m) return null;
            var total = m.score.exploration + m.score.accuracy + m.score.safety + m.score.discovery;
            return {
                exploration: m.score.exploration,
                accuracy: m.score.accuracy,
                safety: m.score.safety,
                discovery: m.score.discovery,
                total: total,
                grade: letterGrade(total)
            };
        },

        /**
         * Check if a given objective is complete.
         */
        isObjectiveComplete: function (objId) {
            var mission = getMissionById(currentMissionId);
            if (!mission) return false;
            for (var i = 0; i < mission.objectives.length; i++) {
                if (mission.objectives[i].id === objId) return mission.objectives[i].completed;
            }
            return false;
        },

        /**
         * Return checkpoints for the active mission.
         */
        getActiveMissionCheckpoints: function () {
            var mission = getMissionById(currentMissionId);
            if (!mission) return [];
            return mission.checkpoints.map(function (cp) {
                return { x: cp.x, z: cp.z, id: cp.id, reached: cp.reached, radius: cp.radius || 6 };
            });
        },

        /**
         * Return all educational cards across all missions.
         */
        getAllEducationalCards: function () {
            var cards = [];
            missions.forEach(function (m) {
                if (m.educationalCards) {
                    m.educationalCards.forEach(function (c) {
                        cards.push(c);
                    });
                }
            });
            return cards;
        },

        /**
         * Attempt interaction at the given rover position.
         * Returns inspection target data if within range, else null.
         */
        interactWithTarget: function (roverPos) {
            var mission = getMissionById(currentMissionId);
            if (!mission) return null;

            // Find the active interact objective
            var activeObj = getActiveObjective(mission);
            if (!activeObj || activeObj.type !== "interact") return null;

            var targetX = activeObj.targetX;
            var targetZ = activeObj.targetZ;
            var range = activeObj.range || 5;

            var d = dist2D(roverPos.x, roverPos.z, targetX, targetZ);
            if (d <= range) {
                activeObj.completed = true;
                inspectionDone = true;
                // Return inspection target data
                return mission.inspectionTarget || {
                    name: "Unknown Target",
                    type: "Geological Sample",
                    analysisData: { iron: 50, silicon: 40, magnesium: 30 },
                    description: "Standard geological formation."
                };
            }
            return null;
        },

        /**
         * Return overall mission progress (0–1) based on completed objectives.
         */
        getMissionProgress: function () {
            var mission = getMissionById(currentMissionId);
            if (!mission) return 0;
            var done = 0;
            mission.objectives.forEach(function (o) {
                if (o.completed) done++;
            });
            return done / mission.objectives.length;
        },

        /**
         * Unlock the mission after the current one.
         */
        unlockNextMission: function () {
            var idx = getMissionIndex(currentMissionId);
            if (idx >= 0 && idx < missions.length - 1) {
                missions[idx + 1].unlocked = true;
            }
            // Unlock moon mission after mission 4 is complete
            var m4 = getMissionById("mission_04");
            if (m4 && m4.completed) {
                var m5 = getMissionById("mission_05");
                if (m5) m5.unlocked = true;
            }
        },

        /**
         * Returns true if the current mission is the moon mission.
         */
        isMoonMode: function () {
            var mission = getMissionById(currentMissionId);
            return mission ? !!mission.isMoonMission : false;
        },

        /**
         * Record a collision (called externally).
         */
        recordCollision: function () {
            collisionCount++;
        },

        /**
         * Get the currently active (first incomplete) objective.
         */
        getActiveObjective: function () {
            var mission = getMissionById(currentMissionId);
            if (!mission) return null;
            return getActiveObjective(mission);
        },

        /**
         * Get distance from rover to the nearest active checkpoint.
         */
        getDistanceToObjective: function (roverX, roverZ) {
            var mission = getMissionById(currentMissionId);
            if (!mission) return -1;

            // Find the first unreached checkpoint
            for (var i = 0; i < mission.checkpoints.length; i++) {
                if (!mission.checkpoints[i].reached) {
                    return dist2D(roverX, roverZ, mission.checkpoints[i].x, mission.checkpoints[i].z);
                }
            }

            // Check active objective for proximity/approach targets
            var obj = getActiveObjective(mission);
            if (obj && (obj.targetX !== undefined)) {
                return dist2D(roverX, roverZ, obj.targetX, obj.targetZ);
            }

            return 0;
        },

        /**
         * Check if rover is near an interactable target (for showing prompt).
         */
        isNearInteractTarget: function (roverX, roverZ) {
            var mission = getMissionById(currentMissionId);
            if (!mission) return false;
            var obj = getActiveObjective(mission);
            if (!obj || obj.type !== "interact") return false;
            var d = dist2D(roverX, roverZ, obj.targetX, obj.targetZ);
            return d <= (obj.range || 5);
        },

        /**
         * Save progress to localStorage.
         */
        _saveProgress: function () {
            try {
                var unlocked = [];
                var completed = [];
                missions.forEach(function (m) {
                    if (m.unlocked) unlocked.push(m.id);
                    if (m.completed) completed.push(m.id);
                });
                localStorage.setItem("afterlight_progress", JSON.stringify({
                    unlockedMissions: unlocked,
                    completedMissions: completed
                }));
            } catch (e) {
                // Ignore storage errors
            }
        },

        /**
         * Reset all saved progress.
         */
        resetProgress: function () {
            try {
                localStorage.removeItem("afterlight_progress");
            } catch (e) { /* ignore */ }
            missions = createMissions();
            currentMissionId = null;
        }
    };

})();
