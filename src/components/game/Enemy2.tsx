"use client";

import {
  useRef,
  useState,
} from "react";

import {
  useFrame,
} from "@react-three/fiber";

import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
  type RapierCollider,
} from "@react-three/rapier";

import * as THREE from "three";

import { Model } from "./GIgieeee";
import { useGameContext } from "./GameContext";


type RapierIntersectionEvent = {
  other: {
    collider: RapierCollider & { handle: number };
    rigidBody?: RapierRigidBody | null;
    rigidBodyObject?: { name?: string } | null;
  };
};


type Enemy2Props = {
  position: [number, number, number];
};


// ==============================
// Strong Enemy Settings
// ==============================

const IDLE_MODEL_URL = "/player/Storngidel.glb";
const MODEL_URL = "/player/StorngRunning.glb";
const ATTACK_MODEL_URL = "/player/StorngAttack.glb";

const ENEMY_SPEED = 7;
const ENEMY_DETECT_RANGE = 60;

const ATTACK_DURATION = 0.8;
const ATTACK_COOLDOWN = 0.35;


// ==============================
// Collider
// ==============================

// ปรับตามขนาดของโมเดล Strong
const ENEMY_HALF_LENGTH = 0.3;
const ENEMY_HALF_HEIGHT = 1.2;
const ENEMY_HALF_WIDTH = 0.4;

const ENEMY_COLLIDER_OFFSET_Y = ENEMY_HALF_HEIGHT;


export default function Enemy2({
  position,
}: Enemy2Props) {

  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const modelRef = useRef<THREE.Group>(null);

  const { playerPosition } = useGameContext();

  const [enemyState, setEnemyState] = useState<
    "run" | "attack" | "idle"
  >("idle");

  const stateRef = useRef<
    "run" | "attack" | "idle"
  >("idle");

  const actionTimerRef = useRef<number>(0);

  const playerCollidersInHitBlock =
    useRef<Set<number>>(new Set());


  useFrame((_, delta) => {

    if (!rigidBodyRef.current) return;


    const enemyPos =
      rigidBodyRef.current.translation();


    const direction =
      playerPosition.current.clone().sub(
        new THREE.Vector3(
          enemyPos.x,
          enemyPos.y,
          enemyPos.z
        )
      );


    const distance = direction.length();


    const inHitRange =
      playerCollidersInHitBlock.current.size > 0;


    // ==============================
    // Timer
    // ==============================

    if (actionTimerRef.current > 0) {
      actionTimerRef.current -= delta;
    }


    // ==============================
    // Enemy State
    // ==============================

    let nextState:
      | "run"
      | "attack"
      | "idle" = "idle";


    if (
      actionTimerRef.current >
      ATTACK_COOLDOWN
    ) {

      nextState = "attack";

    } else if (
      actionTimerRef.current > 0
    ) {

      nextState = "idle";

    } else {

      if (inHitRange) {

        actionTimerRef.current =
          ATTACK_DURATION +
          ATTACK_COOLDOWN;

        nextState = "attack";

      } else if (
        distance < ENEMY_DETECT_RANGE
      ) {

        nextState = "run";

      } else {

        nextState = "idle";

      }
    }


    // ==============================
    // Change State
    // ==============================

    if (
      nextState !== stateRef.current
    ) {

      stateRef.current =
        nextState;

      setEnemyState(
        nextState
      );
    }


    // ==============================
    // Move
    // ==============================

    if (nextState === "run") {

      direction.normalize();


      rigidBodyRef.current.setLinvel(
        {
          x:
            direction.x *
            ENEMY_SPEED,

          y:
            rigidBodyRef.current.linvel().y,

          z:
            direction.z *
            ENEMY_SPEED,
        },
        true
      );


      // หันหน้าเข้าหา Player

      if (modelRef.current) {

        const targetRotation =
          Math.atan2(
            direction.x,
            direction.z
          );


        modelRef.current.rotation.y =
          THREE.MathUtils.lerp(
            modelRef.current.rotation.y,
            targetRotation,
            0.1
          );
      }

    } else {

      rigidBodyRef.current.setLinvel(
        {
          x: 0,

          y:
            rigidBodyRef.current
              .linvel().y,

          z: 0,
        },
        true
      );
    }
  });


  return (
    <RigidBody
      ref={rigidBodyRef}
      position={position}
      gravityScale={1}
      linearDamping={0.5}
      angularDamping={0.5}
      colliders={false}
      lockRotations
      canSleep={false}
    >

      <group ref={modelRef}>

        {/* Strong วิ่ง / ยืนนิ่ง */}

       <group ref={modelRef}>
  <Model
    visible={true}
    modelUrl={IDLE_MODEL_URL}
    paused={false}
  />
</group>

      </group>


      {/* Collider หลัก */}

      <CuboidCollider
        args={[
          ENEMY_HALF_LENGTH,
          ENEMY_HALF_HEIGHT,
          ENEMY_HALF_WIDTH,
        ]}
        position={[
          0,
          ENEMY_COLLIDER_OFFSET_Y,
          0,
        ]}
      />


      {/* Attack Sensor */}

      <CuboidCollider
        args={[
          0.9,
          ENEMY_HALF_HEIGHT,
          0.9,
        ]}
        position={[
          0,
          ENEMY_COLLIDER_OFFSET_Y,
          0,
        ]}
        sensor

        onIntersectionEnter={({
          other,
        }: RapierIntersectionEvent) => {

          if (
            other.rigidBodyObject
              ?.name === "player"
          ) {

            playerCollidersInHitBlock
              .current
              .add(
                other.collider.handle
              );
          }
        }}

        onIntersectionExit={({
          other,
        }: RapierIntersectionEvent) => {

          if (
            other.rigidBodyObject
              ?.name === "player"
          ) {

            playerCollidersInHitBlock
              .current
              .delete(
                other.collider.handle
              );
          }
        }}
      />

    </RigidBody>
  );
}