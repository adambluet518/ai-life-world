# AI Life World — Phase 1 Prototype

A personal 3D artificial-life simulation. This is the Phase 1 foundation: a playable low-poly world with a spherical creature, first-person exploration, and UI panels.

## What is included

- Low-poly terrain with hills
- Trees, rocks, grass patches, and ponds
- Spherical creature ("Orb") that wanders autonomously
- First-person player controls (WASD + mouse)
- Creature status panel (name, age, energy, goal, activity, position)
- Brain / decision placeholder panel
- Achievements panel (locked for now)
- Memory panel
- Activity log
- Settings panel with LM Studio connection test (placeholder for Phase 2)

## Requirements

- Google Chrome (recommended)
- A modern browser that supports ES modules and WebGL
- Optional: LM Studio running locally for the connection test

## How to run locally

1. Open the `Website` folder.
2. Serve it with any static file server (GitHub Pages, or a simple local server).

### Option A — Simple local server (recommended for testing)

If you have Python installed:

```bash
cd Website
python3 -m http.server 8080
```

Then open: http://localhost:8080

### Option B — VS Code / Cursor Live Server

Right-click `index.html` → Open with Live Server.

### Option C — GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of the `Website` folder to the root (or to a `/docs` folder).
3. In repository Settings → Pages, choose the branch and folder.
4. Your site will be available at `https://yourusername.github.io/repo-name/`.

**Important:** The AI (LM Studio) only works when the page is opened from the same machine that is running LM Studio. GitHub Pages serves the frontend only.

## Controls

| Key / Action     | Effect                |
|------------------|-----------------------|
| Click canvas     | Lock mouse pointer    |
| WASD             | Move                  |
| Mouse            | Look around           |
| Space            | Jump                  |
| Escape           | Unlock mouse          |

## LM Studio connection (Phase 1 test only)

1. Open LM Studio.
2. Load a model.
3. Start the local server (usually on port 1234).
4. In the Settings panel of the simulation, click **Test LM Studio Connection**.

CORS note: If the test fails from a GitHub Pages HTTPS URL, you may need to enable CORS in LM Studio or use a local bridge later (Phase 2).

## Project structure

```
AI-Life-World/
├── Website/               ← Deploy this to GitHub Pages
│   ├── index.html
│   ├── style.css
│   └── main.js
├── Source/                ← Future modular source files
├── Assets/
├── Saves/
├── Configuration/
└── README.md
```

## Next phases

- **Phase 2** — Real LM Studio decisions, structured actions, validation
- **Phase 3** — Goals, memory, personality, object discovery
- **Phase 4** — Achievements, experience, age progression
- **Phase 5** — Full persistence (saves, external drive support)
- **Phase 6** — Polish, day/night, more biomes

## Notes

- The creature currently uses simple wander logic. Real AI decisions begin in Phase 2.
- All AI actions will be validated by JavaScript; the model cannot break physics or grant itself achievements.
- Keep the project on your external M.2 as planned. Browser storage (IndexedDB / localStorage) is used for settings in Phase 1.
