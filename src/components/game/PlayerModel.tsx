"use client";

import {
    useEffect,
    useMemo,
    useRef,
} from "react";

import {
    useAnimations,
    useGLTF,
} from "@react-three/drei";

import * as THREE from "three";
// 'Crouch',
//   'CrouchWalking',
//   'Falling',
//   'Idle',
//   'Jog',
//   'Landing',
//   'Run',
//   'RunningJump'
export type PlayerAnimation =
    | "Idle"
    | "Jog"
    | "Run"
    | "RunningJump"
    | "Jump"
    | "Falling"
    | "Landing"
    | "Crouch"
    | "CrouchWalking";
type PlayerModelProps = {
    animation: PlayerAnimation;
};

// ========================================
// ชื่อ Animation จริงใน GLB
// ========================================

const CLIP_NAMES: Record<
    PlayerAnimation,
    string
> = {
    Idle: "Idle",
    Jog: "Jog",
    Run: "Run",
    RunningJump: "RunningJump",
    Jump: "Jump",
    Falling: "Falling",
    Landing: "Landing",
    Crouch: "Crouch",
    CrouchWalking: "CrouchWalking",
};

// ========================================
// Model settings
// ========================================

const MODEL_SCALE = 1.2;
const MODEL_ROTATION_Y = 0;
const MODEL_OFFSET_Y = -0.9;

// ช่วงที่เท้าเริ่มแตะพื้นในคลิป Landing
const LANDING_CLIP_START_TIME = 0.5;

// ========================================
// Animation ที่ต้องลบ Root Motion
// ========================================
const IN_PLACE_CLIPS = new Set([
    "Jog",
    "Run",
    "RunningJump",
    "Jump",
    "Falling",
    "Landing",
    "Crouch",
    "CrouchWalking",
]);

function removeRootMotion(
    sourceClip: THREE.AnimationClip,
) {
    const clip = sourceClip.clone();

    if (!IN_PLACE_CLIPS.has(clip.name)) {
        return clip;
    }

    for (const track of clip.tracks) {
        if (
            !(track instanceof THREE.VectorKeyframeTrack)
        ) {
            continue;
        }

        const name = track.name.toLowerCase();

        if (!name.endsWith(".position")) {
            continue;
        }

        const values = track.values;

        if (values.length < 3) {
            continue;
        }

        const startX = values[0];
        const startZ = values[2];

        const isHips =
            name.includes("hips");

        const isRoot =
            name.includes("root") ||
            name.includes("armature");

        const isLandingHips =
            clip.name === "Landing" &&
            isHips;

        // ===================================
        // สำคัญ: เช็ก Hips ก่อน Root
        // ===================================

        if (isHips) {
            for (
                let i = 0;
                i < values.length;
                i += 3
            ) {
                /*
                 * ห้าม Hips พาตัวละครเดิน
                 */
                values[i] = startX;

                /*
                 * Rig หมุนแกน X อยู่ 90 องศา
                 * local Z จึงเป็นความสูงใน World
                 * Landing ต้องเก็บ Curve นี้ไว้
                 * เพื่อให้เท้าวางพื้นระหว่างรับแรง
                 */
                if (!isLandingHips) {
                    values[i + 2] = startZ;
                }
            }

            continue;
        }

        // ===================================
        // Root / Armature
        // ===================================

        if (isRoot) {
            for (
                let i = 0;
                i < values.length;
                i += 3
            ) {
                /*
                 * ล็อก Root ไม่ให้พา Model เคลื่อน
                 */
                values[i] = startX;
                values[i + 2] = startZ;
            }
        }
    }

    return clip;
}

export default function PlayerModel({
    animation,
}: PlayerModelProps) {
    const modelRef =
        useRef<THREE.Group>(null);

    const previousAction =
        useRef<THREE.AnimationAction | null>(
            null,
        );

    const {
        scene,
        animations,
    } = useGLTF(
        "/player/student.glb",
    );

    // ========================================
    // ทำ Animation ให้เป็น In Place
    // ========================================

    const inPlaceAnimations =
        useMemo(() => {
            return animations.map(
                removeRootMotion,
            );
        }, [animations]);

    const {
        names,
        mixer,
    } = useAnimations(
        inPlaceAnimations,
        modelRef,
    );

    // ========================================
    // Mesh settings
    // ========================================

    useEffect(() => {
        scene.traverse((object: THREE.Object3D) => {
            if (
                object instanceof THREE.Mesh ||
                object instanceof THREE.SkinnedMesh
            ) {
                object.castShadow = true;
                object.receiveShadow = true;

                object.frustumCulled = false;
            }
        });
    }, [scene]);

    // ========================================
    // Debug รายชื่อ Animation
    // ========================================

    useEffect(() => {
        console.log(
            "Animations:",
            names,
        );
    }, [names]);

    // ========================================
    // เล่น Animation
    // ========================================

    useEffect(() => {
        const clipName = CLIP_NAMES[animation];

        const clip = inPlaceAnimations.find(
            (c) => c.name === clipName,
        );

        if (!clip || !mixer || !modelRef.current) {
            console.warn(
                `ไม่พบ Animation: ${clipName}`,
                names,
            );

            return;
        }

        const nextAction = mixer.clipAction(
            clip,
            modelRef.current,
        );

        // ถ้าเป็นตัวเดิม ไม่ต้อง restart
        if (previousAction.current === nextAction) {
            return;
        }

        const oldAction = previousAction.current;

        const isOneShot =
            animation === "Jump" ||
            animation === "RunningJump" ||
            animation === "Landing";

        if (isOneShot) {
            nextAction.setLoop(THREE.LoopOnce, 1);
            nextAction.clampWhenFinished = true;
        } else {
            nextAction.setLoop(THREE.LoopRepeat, Infinity);
            nextAction.clampWhenFinished = false;
        }

        nextAction.reset();

        if (
            animation === "Landing" &&
            nextAction.getClip().duration >
            LANDING_CLIP_START_TIME
        ) {
            nextAction.time = LANDING_CLIP_START_TIME;
        }

        nextAction
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(0.15)
            .play();

        if (oldAction && oldAction !== nextAction) {
            oldAction.fadeOut(0.15);
        }

        previousAction.current = nextAction;
    }, [
        inPlaceAnimations,
        animation,
        names,
        mixer,
    ]);

    // ========================================
    // Cleanup
    // ========================================

    useEffect(() => {
        return () => {
            if (mixer) {
                mixer.stopAllAction();
            }
        };
    }, [mixer]);

    return (
        <group
            ref={modelRef}
            position={[
                0,
                MODEL_OFFSET_Y,
                0,
            ]}
            rotation={[
                0,
                MODEL_ROTATION_Y,
                0,
            ]}
            scale={MODEL_SCALE}
        >
            <primitive object={scene} />
        </group>
    );
}

useGLTF.preload(
    "/player/student.glb",
);
