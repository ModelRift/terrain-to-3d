# Terrain To STL

This is a simple browser-based editor which creates printable 3D terrain models (`.stl`) from just latitude and longitude input.

Demo: [https://terrain.modelrift.com](https://terrain.modelrift.com)

Built by [ModelRift](https://modelrift.com) team.
ModelRift is an AI-enhanced browser-based IDE for OpenSCAD.

Uses awesome [OpenSCAD WASM build by @DSchroer](https://github.com/DSchroer/openscad-wasm) so all the magic happens right in your browser.


UI is built using React and Shadcn. Three.js is used as a model viewer.

## How it works
- Step 1 downloads elevation tiles and builds a grayscale heightmap of the chosen lat/long. 
Terrain data is downloaded from [this public dataset](https://aws.amazon.com/blogs/publicsector/announcing-terrain-tiles-on-aws-a-qa-with-mapzen/).
[Interesting read on how the terrain tiles are encoded](https://github.com/mapzen/terrarium)

- Step 2 generates OpenSCAD code and compiles an STL in the browser (WASM worker).

- Three.js renders the produced .stl model in a browser, with a beautiful lightning applied.

## What you can control
- Center point: latitude and longitude
- Area size in km
- Heightmap resolution
- Tile zoom level
- Model size in mm
- Z exaggeration
- Base thickness

## How To Run

### Docker Compose
```bash
docker compose up --build -d
```

Open [http://localhost:8083](http://localhost:8083).


### Development (Docker Compose)
Big map rendering is slow in dev mode!
```bash
docker compose -f docker-compose.dev.yml up --build
```

Open [http://localhost:5176](http://localhost:5176).


### Development (Local pnpm)
```bash
pnpm install
pnpm dev
```

Then open the Vite URL from terminal output and:
1. Click `Download Terrain`
2. Click `Generate STL`
3. Download `terrain.stl` (or `terrain.scad`)

## Notes
- Terrain data is fetched from Terrarium elevation tiles.
- Internet access is required while fetching terrain data.
