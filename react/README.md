# AFTERLIGHT: Mars & Moon Rover — React Integration Guide

This package provides a **drop-in React component (`<MarsRoverGame />`)** for your educational museum website.

---

### Why WebGL/Three.js inside React is the Most Suitable Choice:

1. **Zero-Friction for Kids & Schools**:
   * Desktop languages (C++, native Lua) require downloading `.exe` installers. School computers (Chromebooks, iPads, and managed Windows/Mac labs) have strict administrative locks that block student downloads.
   * A React WebGL component runs **instantly in any web browser** with zero installation required.

2. **Full React State Integration**:
   * You can listen to mission completion events, pass student scores to your backend database, unlock educational badges, and customize the UI using React state.

3. **60 FPS Performance on Modest Classroom Laptops**:
   * Optimized with procedural shaders, instanced pebble rendering, and frustum culling to run smoothly on standard classroom hardware.

---

## Quick Start (Drop into Any React Project)

### 1. Installation
In your React project root:
```bash
npm install three
```

### 2. Copy the Component Files
Copy the `react/` folder into your React components directory (e.g., `src/components/MarsRover/`):
* `MarsRoverGame.jsx`
* `MarsRoverGame.css`
* `index.js`

And copy the texture assets into your `public/assets/textures/` folder:
* `mars_surface.jpg`
* `mars_rock.webp`
* `moon_surface.avif`
* `moon_rock.jpg`

---

## 3. Basic Example (`App.jsx`)

```jsx
import React, { useState } from 'react';
import MarsRoverGame from './components/MarsRover';

export default function App() {
  const [selectedWorld, setSelectedWorld] = useState('mars'); // 'mars' or 'moon'
  const [score, setScore] = useState(0);
  const [badges, setBadges] = useState([]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Educational Website Header */}
      <header style={{ padding: '12px 20px', background: '#080D16', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>AFTERLIGHT: NASA Exploration Lab</h2>
        <div>
          <button 
            onClick={() => setSelectedWorld('mars')}
            style={{ marginRight: 8, background: selectedWorld === 'mars' ? '#E47D54' : '#19273a', color: '#fff', border: 0, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}
          >
            🔴 Mars Ares Vallis
          </button>
          <button 
            onClick={() => setSelectedWorld('moon')}
            style={{ background: selectedWorld === 'moon' ? '#69C9F2' : '#19273a', color: selectedWorld === 'moon' ? '#000' : '#fff', border: 0, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}
          >
            🌑 Moon Expedition
          </button>
        </div>
        <div>Total Score: <b>{score} pts</b></div>
      </header>

      {/* 3D Rover Game Component */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MarsRoverGame
          initialWorld={selectedWorld}
          soundEnabled={true}
          volume={0.5}
          assetBasePath="/assets"
          onMissionComplete={(data) => {
            console.log('Mission Cleared!', data);
            setScore(prev => prev + data.score);
            alert(`🎉 Congratulations! You completed ${data.mission} with ${data.accuracy}% accuracy!`);
          }}
          onFactDiscovered={(fact) => {
            console.log('Educational Fact Unlocked:', fact);
            if (!badges.includes(fact.title)) {
              setBadges(prev => [...prev, fact.title]);
            }
          }}
        />
      </div>
    </div>
  );
}
```

---

## Component Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`initialWorld`** | `'mars' \| 'moon'` | `'mars'` | Planetary setting (Ares Vallis or Oceanus Procellarum) |
| **`initialMission`** | `number` | `0` | Mission index (0 to 3) |
| **`showBuiltInUI`** | `boolean` | `true` | Show radar, speed, compass, and objectives |
| **`soundEnabled`** | `boolean` | `true` | Master audio mute toggle |
| **`volume`** | `number` | `0.6` | Audio volume (0.0 to 1.0) |
| **`assetBasePath`**| `string` | `'assets'` | URL path to the texture files directory |
| **`onMissionComplete`** | `function` | `undefined` | Callback fired when students finish a mission |
| **`onFactDiscovered`** | `function` | `undefined` | Callback fired when students encounter a NASA educational card |
| **`onTelemetryUpdate`** | `function` | `undefined` | Real-time telemetry feed (`speed`, `health`, `heading`, `odometer`) |

