"use client";

import * as THREE from "three";
import React from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";


// ========================================
// Strong Enemy Models
// ========================================

export const STRONG_IDLE_URL =
  "/player/Storngidel.glb";

export const STRONG_RUN_URL =
  "/player/StorngRunning.glb";

export const STRONG_ATTACK_URL =
  "/player/StorngAttack.glb";


// ========================================
// ทำ Animation ให้อยู่กับที่
// ป้องกัน Root Motion ดันโมเดลออกจาก Collider
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
      track.values[i] = 0;
      track.values[i + 1] = 0;
    }
  }

  return clip;
}


// ========================================
// Props
// ========================================

type StrongModelProps = {
  modelUrl: string;
  paused?: boolean;
  visible?: boolean;
};


// ========================================
// Strong Model
// ========================================

export default function StrongModel({
  modelUrl,
  paused = false,
  visible = true,
}: StrongModelProps) {

  const groupRef =
    React.useRef<THREE.Group>(null);

  const { scene, animations } =
    useGLTF(modelUrl);


  // แยก Skeleton ของแต่ละตัว
  const clonedScene = React.useMemo(
    () => SkeletonUtils.clone(scene),
    [scene]
  );


  // ทำ Animation ให้อยู่กับที่
  const inPlaceAnimations =
    React.useMemo(
      () =>
        animations.map(toInPlaceClip),
      [animations]
    );


  // ตั้งค่า Mesh
  React.useEffect(() => {

    clonedScene.traverse((object) => {

      if (object instanceof THREE.Mesh) {

        object.castShadow = true;
        object.receiveShadow = true;

        // ป้องกันโมเดลหายตอน Animation
        object.frustumCulled = false;
      }
    });

  }, [clonedScene]);


  const {
    actions,
    names,
  } = useAnimations(
    inPlaceAnimations,
    groupRef
  );


  /*
   * Strong บางไฟล์อาจไม่มี Animation
   * ดังนั้นถ้าไม่มี names ก็แค่แสดงโมเดล
   */

  const animationName =
    names.length > 0
      ? names[0]
      : undefined;


  // ========================================
  // เริ่ม Animation
  // ========================================

  React.useEffect(() => {

    if (!animationName) {
      return;
    }

    const action =
      actions[animationName];

    if (!action) {
      return;
    }

    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(
      paused ? 0 : 1
    );
    action.play();

  }, [
    actions,
    animationName,
    paused,
  ]);


  // ========================================
  // แสดง Model
  // ========================================

  return (
    <group
      ref={groupRef}
      visible={visible}
      dispose={null}
    >
      <primitive
        object={clonedScene}
      />
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