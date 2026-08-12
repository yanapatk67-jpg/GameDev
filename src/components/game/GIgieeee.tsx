"use client";

/*
 * โมเดลศัตรู
 *
 * ใช้ AnimetionGigee.glb เป็นไฟล์หลัก
 * เพราะไฟล์นี้มีทั้ง Skinned Mesh + Armature + คลิปอนิเมชั่น
 *
 * ส่วน GIgieeee.glb เป็น Static Mesh ไม่มีกระดูก
 * จึงขยับตามอนิเมชั่นไม่ได้
 */

import * as THREE from 'three'
import React, { JSX } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'

export const MODEL_URL = '/player/GegeeRUN.glb'
export const ATTACK_MODEL_URL = '/player/GegeeATK.glb'


const MODEL_OFFSET_Y = 0.031

const FADE_DURATION = 0.2

// ขนาดตัวผีตอนเดิน (หัวชี้ไปทาง +Z ของโมเดล)
export const ENEMY_MODEL_HEIGHT = 0.67
export const ENEMY_MODEL_LENGTH = 1.65

/*
 * คลิปนี้มี Root Motion อยู่ที่ Hips
 *
 * ถ้าปล่อยไว้ ผีจะคลานหนีไปข้างหน้าราว 2.3 หน่วย
 * ภายในรอบเดียวแล้วเด้งกลับ
 * เพราะ RigidBody ไม่ได้ขยับตาม
 *
 * ล็อก Hips ให้คลานอยู่กับที่
 * แล้วให้ Rapier เป็นคนพาตัวเคลื่อนที่แทน
 *
 * แกนของ Hips เป็น Local ของ Armature ที่หมุน 90 องศาไว้
 *
 *   local X -> world X  (ซ้ายขวา)      ล็อก
 *   local Y -> world Z  (หน้าหลัง)     ล็อก
 *   local Z -> world Y  (สูงต่ำ)       ปล่อยไว้ ให้ลำตัวขยับตามจังหวะ
 *
 * ตั้ง X / Y เป็น 0 แทนค่าคีย์แรก
 * เพื่อให้กลางลำตัวตรงกับจุดกำเนิดของ Collider
 */
function toInPlaceClip(sourceClip: THREE.AnimationClip) {
  const clip = sourceClip.clone()

  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue
    if (!/hips/i.test(track.name)) continue

    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = 0
      track.values[i + 1] = 0
    }
  }

  return clip
}

type ModelProps = JSX.IntrinsicElements['group'] & {
  animation?: string
  modelUrl?: string
  // หยุดอนิเมชั่นค้างท่าปัจจุบัน ใช้ตอนผีไม่ได้เคลื่อนที่
  paused?: boolean
}

export function Model(props: ModelProps) {
  const { animation, modelUrl = MODEL_URL, paused = false, ...groupProps } = props;

  const groupRef = React.useRef<THREE.Group>(null);

  const previousAction =
    React.useRef<THREE.AnimationAction | null>(null);

  const { scene, animations } = useGLTF(modelUrl);


  /*
   * แต่ละตัวต้องมี Skeleton ของตัวเอง
   * ไม่งั้นศัตรูหลายตัวจะขยับพร้อมกันหมด
   */
  const clonedScene = React.useMemo(
    () => SkeletonUtils.clone(scene),
    [scene],
  );

  const inPlaceAnimations = React.useMemo(
    () => animations.map(toInPlaceClip),
    [animations],
  );

  React.useEffect(() => {
    clonedScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;

        // กัน Mesh หายตอนกระดูกพาออกนอก Bounding Box เดิม
        object.frustumCulled = false;
      }
    });
  }, [clonedScene]);

  const { actions, names } = useAnimations(inPlaceAnimations, groupRef);
  console.log('clip names:', names);

  /*
   * ชื่อคลิปใน GLB คือ "Armature|mixamo.com|Layer0"
   * ถ้าชื่อที่ส่งมาไม่ตรง ให้เล่นคลิปแรกไปก่อน
   *
   * ต้องคิดชื่อคลิปที่ใช้จริงออกมาก่อน
   * แล้วค่อยเอาไปเป็น Dependency
   *
   * ถ้าผูก Effect ไว้กับ prop animation ตรง ๆ
   * การสลับ "Run" <-> "Idle" ที่ Map ไปคลิปเดียวกัน
   * จะไปสั่ง fadeOut ทิ้งทุกครั้ง
   */
  const clipName =
    names.length === 0
      ? undefined
      : (animation && names.includes(animation))
        ? animation
        : names[0];

  React.useEffect(() => {
    const action = clipName ? actions[clipName] : undefined;

    if (!action) return;

    const previous = previousAction.current;

    previousAction.current = action;

    /*
     * ต้องสั่ง play ใหม่ทุกครั้งที่ Effect ทำงาน
     * ห้าม Early Return ต่อให้เป็น Action ตัวเดิม
     *
     * ตอน Component Remount (StrictMode / Fast Refresh)
     * useAnimations ของ drei จะ Cleanup ด้วย mixer.stopAllAction()
     * แต่คืน Action ตัวเดิมกลับมาให้
     *
     * ถ้าเช็กว่าเป็นตัวเดิมแล้วข้าม จะไม่มีใครปลุกมันขึ้นมาอีก
     * Weight เหลือ 0 แล้วผีจะกลับไปเป็น Bind Pose ท่ายืน
     *
     * (เช็ก isRunning แทนก็ไม่ได้
     *  เพราะมันคืน false เมื่อ timeScale เป็น 0
     *  ซึ่งคือตอนที่เราสั่งหยุดค้างท่าไว้เอง)
     */
    action.reset().play();

    if (previous && previous !== action) {
      // เกลี่ยจากท่าเดิมไปท่าใหม่
      action.setEffectiveWeight(0).fadeIn(FADE_DURATION);
      previous.fadeOut(FADE_DURATION);

      return;
    }

    /*
     * ท่าแรก ใส่น้ำหนักเต็มทันที ห้าม fadeIn
     *
     * Bind Pose ของ Rig ตัวนี้เป็นท่า "ยืน" สูง 1.64
     * ท่าคลานมาจากคลิปล้วน ๆ
     *
     * ระหว่าง fadeIn น้ำหนักยังไม่เต็ม
     * ผีจะโผล่มาเป็นท่ายืนแล้วค่อยยุบลงไปคลาน
     */
    action.setEffectiveWeight(1);
  }, [actions, clipName]);

  /*
   * ไฟล์นี้มีคลิปเดียว ไม่มีท่ายืนเฉย ๆ
   *
   * ตอนผีหยุด จึงหยุดคลิปค้างไว้แทน
   * ห้ามใช้ stop() หรือลดน้ำหนักเป็น 0
   * เพราะ Mesh จะเด้งกลับไปเป็น Bind Pose ท่ายืน
   */
  React.useEffect(() => {
    const action = clipName ? actions[clipName] : undefined;

    if (!action) return;

    /*
     * ใช้ TimeScale 0 แทน action.paused
     * เพราะ React Compiler ห้ามเขียนทับ Property
     * ของค่าที่ Hook คืนมา
     *
     * ผลลัพธ์เหมือนกัน คือเวลาหยุดเดิน
     * แต่ Mixer ยังคุมโพสอยู่ที่น้ำหนักเต็ม
     */
    action.setEffectiveTimeScale(paused ? 0 : 1);
  }, [actions, clipName, paused]);

  return (
    <group ref={groupRef} {...groupProps} dispose={null}>
      <group position={[0, MODEL_OFFSET_Y, 0]}>
        <primitive object={clonedScene} />
      </group>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
useGLTF.preload(ATTACK_MODEL_URL)