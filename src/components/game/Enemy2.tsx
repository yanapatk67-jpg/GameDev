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

import StrongModel, {
  STRONG_IDLE_URL,
  STRONG_RUN_URL,
  STRONG_ATTACK_URL,
} from "./StrongModel";

import { useGameContext } from "./GameContext";


// ========================================
// Rapier Intersection Event
// ========================================

type RapierIntersectionEvent = {
  other: {
    collider:
    RapierCollider & {
      handle: number;
    };

    rigidBody?:
    RapierRigidBody | null;

    rigidBodyObject?:
    {
      name?: string;
    } | null;
  };
};


// ========================================
// Enemy2 Props
// ========================================

type Enemy2Props = {
  position: [
    number,
    number,
    number
  ];
};


// ========================================
// Strong Enemy Settings
// ========================================

const ENEMY_SPEED = 7;

const ENEMY_DETECT_RANGE = 60;

const ATTACK_DURATION = 0.8;

const ATTACK_COOLDOWN = 0.35;


// ========================================
// Collider Settings
// ปรับขนาด Collider  (hitbox) ให้เหมาะสมกับโมเดล
// ========================================

const ENEMY_HALF_LENGTH = 0.2;

const ENEMY_HALF_HEIGHT = 0.8;

const ENEMY_HALF_WIDTH = 0.25;

const ENEMY_COLLIDER_OFFSET_Y =
  ENEMY_HALF_HEIGHT;


// ========================================
// Enemy2
// ========================================

export default function Enemy2({
  position,
}: Enemy2Props) {

  const rigidBodyRef =
    useRef<RapierRigidBody>(null);

  const modelRef =
    useRef<THREE.Group>(null);


  const {
    playerPosition,
  } = useGameContext();


  // ======================================
  // Enemy State
  // ======================================

  const [
    enemyState,
    setEnemyState,
  ] = useState<
    "run" |
    "attack" |
    "idle"
  >("idle");


  const stateRef =
    useRef<
      "run" |
      "attack" |
      "idle"
    >("idle");


  const actionTimerRef =
    useRef<number>(0);


  // ======================================
  // Player Hit Detection
  // ======================================

  const playerCollidersInHitBlock =
    useRef<Set<number>>(
      new Set()
    );


  // ======================================
  // Enemy AI
  // ======================================

  useFrame((_, delta) => {

    if (!rigidBodyRef.current) {
      return;
    }


    // ------------------------------------
    // Enemy Position
    // ------------------------------------

    const enemyPos =
      rigidBodyRef.current.translation();


    // ------------------------------------
    // Direction To Player
    // ------------------------------------

    const direction =
      playerPosition.current
        .clone()
        .sub(
          new THREE.Vector3(
            enemyPos.x,
            enemyPos.y,
            enemyPos.z
          )
        );


    const distance =
      direction.length();


    // ------------------------------------
    // Attack Range
    // ------------------------------------

    const inHitRange =
      playerCollidersInHitBlock
        .current
        .size > 0;


    // ------------------------------------
    // Attack Timer
    // ------------------------------------

    if (
      actionTimerRef.current > 0
    ) {

      actionTimerRef.current -=
        delta;
    }


    // ====================================
    // Determine State
    // ====================================

    let nextState:
      | "run"
      | "attack"
      | "idle" = "idle";


    // กำลังโจมตี
    if (
      actionTimerRef.current >
      ATTACK_COOLDOWN
    ) {

      nextState = "attack";


      // ช่วงพักหลังโจมตี
    } else if (
      actionTimerRef.current > 0
    ) {

      nextState = "idle";


      // ไม่มี Timer
    } else {

      // Player อยู่ในระยะโจมตี
      if (inHitRange) {

        actionTimerRef.current =
          ATTACK_DURATION +
          ATTACK_COOLDOWN;

        nextState = "attack";


        // Player อยู่ในระยะตรวจจับ
      } else if (
        distance <
        ENEMY_DETECT_RANGE
      ) {

        nextState = "run";


        // Player อยู่ไกล
      } else {

        nextState = "idle";
      }
    }


    // ====================================
    // Change State
    // ====================================

    if (
      nextState !==
      stateRef.current
    ) {

      stateRef.current =
        nextState;

      setEnemyState(
        nextState
      );
    }


    // ====================================
    // Movement
    // ====================================

    if (
      nextState === "run"
    ) {

      if (
        direction.lengthSq() > 0
      ) {

        direction.normalize();
      }


      // ----------------------------------
      // Move Toward Player
      // ----------------------------------

      rigidBodyRef.current.setLinvel(
        {
          x:
            direction.x *
            ENEMY_SPEED,

          y:
            rigidBodyRef.current
              .linvel().y,

          z:
            direction.z *
            ENEMY_SPEED,
        },
        true
      );


      // ----------------------------------
      // Rotate Toward Player
      // ----------------------------------

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

      // ----------------------------------
      // Stop Horizontal Movement
      // ----------------------------------

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


  // ========================================
  // Render
  // ========================================

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

      {/* ==================================
          Strong Model
          ================================== */}

      <group ref={modelRef}>

        <StrongModel
          modelUrl={STRONG_IDLE_URL}
          visible={enemyState === "idle"}
          paused={false}
        />

        <StrongModel
          modelUrl={STRONG_RUN_URL}
          visible={enemyState === "run"}
          paused={false}
        />

        <StrongModel
          modelUrl={STRONG_ATTACK_URL}
          visible={enemyState === "attack"}
          paused={false}
        />

      </group>


      {/* ==================================
          Main Collider
          ================================== */}

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


      {/* ==================================
          Attack Sensor
          ================================== */}
      {/* Sensor สำหรับตรวจจับ Player ว่าอยู่ในระยะโจมตีหรือไม่ */}

      <CuboidCollider
        args={[0.6, 0.8, 0.6]}
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
            other
              .rigidBodyObject
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
            other
              .rigidBodyObject
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