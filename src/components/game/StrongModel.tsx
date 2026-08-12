"use client";

import * as THREE from "three";
import React, { JSX } from "react";
import {
  useGLTF,
  useAnimations,
} from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";

// ========================================
// Strong Models
// ========================================

export const STRONG_IDLE_URL =
  "/player/Storngidel.glb";

export const STRONG_RUN_URL =
  "/player/StorngRunning.glb";

export const STRONG_ATTACK_URL =
  "/player/StorngAttack.glb";

// ========================================
// Settings
// ========================================

const MODEL_SCALE = 130;
const MODEL_OFFSET_Y = 0;

// ========================================
// Props
// ========================================

type StrongModelProps =
  JSX.IntrinsicElements["group"] & {
    animation?: string;
    modelUrl: string;
    paused?: boolean;
  };

// ========================================
// Strong Model
// ========================================

export default function StrongModel({
  animation,
  modelUrl,
  paused = false,
  ...groupProps
}: StrongModelProps) {

  const groupRef =
    React.useRef<THREE.Group>(null);

  const previousAction =
    React.useRef<THREE.AnimationAction | null>(
      null
    );

  // ======================================
  // Load GLB
  // ======================================

  const {
    scene,
    animations,
  } = useGLTF(modelUrl);

  // ======================================
  // Clone Model
  // ======================================

  const clonedScene =
    React.useMemo(
      () => SkeletonUtils.clone(scene),
      [scene]
    );

  // ======================================
  // IMPORTANT
  // ======================================
  // ไม่แก้ Root Motion
  // ใช้ Animation จาก GLB โดยตรง
  //
  // เพราะ Strong Running / Attack
  // ต้องใช้การเคลื่อนไหวของ Animation
  // ======================================

  const strongAnimations = animations;

  // ======================================
  // Mesh Settings
  // ======================================

  React.useEffect(() => {

    clonedScene.traverse(
      (object) => {

        if (
          object instanceof THREE.Mesh
        ) {

          object.castShadow = true;
          object.receiveShadow = true;

          // ป้องกันโมเดลหาย
          object.frustumCulled = false;
        }

      }
    );

  }, [clonedScene]);

  // ======================================
  // Animation Controller
  // ======================================

  const {
    actions,
    names,
  } = useAnimations(
    strongAnimations,
    groupRef
  );

  console.log(
    "STRONG MODEL:",
    modelUrl
  );

  console.log(
    "STRONG ANIMATIONS:",
    names
  );

  // ======================================
  // เลือก Animation
  // ======================================

  const clipName =
    names.length === 0
      ? undefined
      : (
          animation &&
          names.includes(animation)
        )
        ? animation
        : names[0];

  // ======================================
  // Play Animation
  // ======================================

  React.useEffect(() => {

    const action =
      clipName
        ? actions[clipName]
        : undefined;

    if (!action) {
      return;
    }

    const previous =
      previousAction.current;

    previousAction.current =
      action;

    // เริ่ม Animation
    action.reset();
    action.play();

    // ถ้าเปลี่ยน Animation
    if (
      previous &&
      previous !== action
    ) {

      action
        .setEffectiveWeight(0)
        .fadeIn(0.2);

      previous.fadeOut(0.2);

    } else {

      action.setEffectiveWeight(1);

    }

  }, [
    actions,
    clipName,
  ]);

  // ======================================
  // Pause / Run
  // ======================================

  React.useEffect(() => {

    const action =
      clipName
        ? actions[clipName]
        : undefined;

    if (!action) {
      return;
    }

    action.setEffectiveTimeScale(
      paused ? 0 : 1
    );

  }, [
    actions,
    clipName,
    paused,
  ]);

  // ======================================
  // Render
  // ======================================

  return (
    <group
      ref={groupRef}
      {...groupProps}
      dispose={null}
    >

      <group
        position={[
          0,
          MODEL_OFFSET_Y,
          0,
        ]}
        scale={[
          MODEL_SCALE,
          MODEL_SCALE,
          MODEL_SCALE,
        ]}
      >

        <primitive
          object={clonedScene}
        />

      </group>

    </group>
  );
}

// ========================================
// Preload
// ========================================

useGLTF.preload(
  STRONG_IDLE_URL
);

useGLTF.preload(
  STRONG_RUN_URL
);

useGLTF.preload(
  STRONG_ATTACK_URL
);