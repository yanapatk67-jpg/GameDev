"use client";


import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";

import Map from "./Map";
import Player from "./Player";
import PushableBox from "./PushableBox";
import Enemy from "./Enemy";
import { GameProvider } from "./GameContext";

export default function GameScene() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{
          /*
           * ค่านี้เป็นแค่ค่าเริ่มต้น
           * Player จะเข้ามาควบคุมกล้องต่อ
           */ 
          position: [0, 4, 12],
          fov: 60,
          near: 0.1,
          far: 200,
        }}
      >
        <color
          attach="background"
          args={["#151515"]}
        />

        <ambientLight intensity={0.8} />

        <directionalLight
          castShadow
          position={[-5, 10, 8]}
          intensity={2}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        <GameProvider>
          <Physics
            gravity={[0, -18, 0]}
            debug
          >
            <Map />

            <PushableBox
              position={[3, 3, -1.5]}
            />

            <Player />

            <Enemy position={[10, 2, 0]} />
          </Physics>
        </GameProvider>
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-black/70 px-4 py-3 text-sm leading-6 text-white">
        A / D = เดิน
        <br />
        Shift + A / D = วิ่ง
        <br />
        Space = กระโดด
        <br />
        C / Ctrl = ย่อ
      </div>
    </div>
  );
}