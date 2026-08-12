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
// Strong Model Settings
// ========================================

// ทั้ง 3 ไฟล์มีขนาด geometry เล็กมาก
// ขนาด โมเดล
// จึงต้องขยายให้เท่ากัน
const MODEL_SCALE = 130;

// จุดยืนของโมเดล
const MODEL_OFFSET_Y = 0;


// ========================================
// Animation
// ========================================

function toInPlaceClip(
  sourceClip: THREE.AnimationClip
) {
  const clip = sourceClip.clone();

  for (const track of clip.tracks) {

    if (!track.name.endsWith(".position")) {
      continue;
    }

    if (!/hips/i.test(track.name)) {
      continue;
    }

    for (
      let i = 0;
      i < track.values.length;
      i += 3
    ) {
      // ล็อก Root Motion แนว X
      track.values[i] = 0;

      // ล็อก Root Motion แนว Y
      track.values[i + 1] = 0;
    }
  }

  return clip;
}


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
// StrongModel
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
    React.useRef<
      THREE.AnimationAction | null
    >(null);


  // ======================================
  // Load GLB
  // ======================================

  const {
    scene,
    animations,
  } = useGLTF(modelUrl);


  // ======================================
  // Clone Skeleton
  // ======================================

  const clonedScene =
    React.useMemo(
      () =>
        SkeletonUtils.clone(scene),
      [scene]
    );


  // ======================================
  // Fix Root Motion
  // ======================================

  const inPlaceAnimations =
    React.useMemo(
      () =>
        animations.map(
          toInPlaceClip
        ),
      [animations]
    );


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

          // ป้องกันโมเดลหายจาก Frustum
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
    inPlaceAnimations,
    groupRef
  );


  console.log(
    "STRONG:",
    modelUrl,
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


    action.reset().play();


    if (
      previous &&
      previous !== action
    ) {

      action
        .setEffectiveWeight(0)
        .fadeIn(0.2);

      previous.fadeOut(0.2);

      return;
    }


    action.setEffectiveWeight(1);

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

      {/* จุดอ้างอิงเดียวกันทั้ง 3 โมเดล */}

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