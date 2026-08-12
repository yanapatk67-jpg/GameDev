"use client";

import React, { createContext, useContext, useRef } from "react";
import * as THREE from "three";

type GameContextType = {
  playerPosition: React.MutableRefObject<THREE.Vector3>;
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const playerPosition = useRef(new THREE.Vector3(0, 0, 0));

  return (
    <GameContext.Provider value={{ playerPosition }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGameContext must be used within GameProvider");
  }
  return context;
}
