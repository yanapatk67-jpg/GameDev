"use client";

import { Html } from "@react-three/drei";

import * as THREE from "three";

import {
    CuboidCollider,
    RigidBody,
    useBeforePhysicsStep,
    useRapier,
    type RapierCollider,
    type RapierRigidBody,
} from "@react-three/rapier";

import {
    useEffect,
    useRef,
    useState,
} from "react";

type PushableBoxProps = {
    position?: [number, number, number];
};

type PhysicsStep = {
    timestep: number;
};

type RapierIntersectionEvent = {
    other: {
        collider: RapierCollider & { handle: number };
        rigidBody?: RapierRigidBody | null;
        rigidBodyObject?: { name?: string } | null;
    };
};

// ============================
// Grab Settings
// ============================

// ระยะ Player ↔ Box ตอนจับ
// เว้นระยะมากกว่ารัศมี Player + ครึ่งกว้างกล่อง
// เล็กน้อย เพื่อไม่ให้ collider ซ้อนกันตอนเข้า Z = 0
const MIN_GRAB_DISTANCE = 1;
const MAX_GRAB_DISTANCE = 1.3;

// ความแรงในการดึง Box
// ให้ตาม Player
const FOLLOW_STRENGTH = 12;

// จำกัดไม่ให้ Box พุ่งเร็วเกิน
// ต้องมากกว่าความเร็ววิ่งของ Player เล็กน้อย
const MAX_FOLLOW_SPEED = 12;

// ============================
// Box Lane
// ============================

// ตำแหน่งปกติ กล่องหลบออกจากทาง Player
const BOX_STORAGE_Z = -1.5;

// ตำแหน่งเดียวกับ Player
const PLAYER_LANE_Z = 0;

// X ที่ต้องดันกล่องไปถึง
const BOX_TARGET_X = 8;

// ระยะยอมรับว่าถึงจุดแล้ว
const BOX_TARGET_TOLERANCE = 0.25;

// ความเร็วสูงสุดตอนเลื่อนกล่องเข้าทางเดิน
const BOX_LANE_MOVE_SPEED = 4;

// ความแรงที่ใช้พากล่องตาม Z เป้าหมายระหว่างดัน
const BOX_LANE_FOLLOW_STRENGTH = 12;

// ความเร็วเก็บตำแหน่ง X/Z ช่วงสุดท้าย
const BOX_FINAL_MOVE_SPEED = 4;

function clamp(
    value: number,
    min: number,
    max: number,
) {
    return Math.max(
        min,
        Math.min(max, value),
    );
}

function moveTowards(
    current: number,
    target: number,
    maxDistance: number,
) {
    const distance = target - current;

    if (Math.abs(distance) <= maxDistance) {
        return target;
    }

    return (
        current +
        Math.sign(distance) * maxDistance
    );
}

function getPlacementProgress(
    currentX: number,
    startX: number,
) {
    const totalDistance =
        BOX_TARGET_X - startX;

    if (Math.abs(totalDistance) < 0.001) {
        return 1;
    }

    return clamp(
        (currentX - startX) /
            totalDistance,
        0,
        1,
    );
}

export default function PushableBox({
    position = [3, 2, BOX_STORAGE_Z],
}: PushableBoxProps) {
    // ============================
    // Physics
    // ============================

    const bodyRef =
        useRef<RapierRigidBody | null>(
            null,
        );

    const interactionSensorRef =
        useRef<RapierCollider | null>(
            null,
        );

    const promptAnchorRef =
        useRef<THREE.Group | null>(
            null,
        );

    const { rapier } = useRapier();

    // Player ที่กำลังอยู่ใน Sensor
    const nearbyPlayerRef =
        useRef<RapierRigidBody | null>(
            null,
        );

    // Player ที่กำลังจับ Box
    const grabbedPlayerRef =
        useRef<RapierRigidBody | null>(
            null,
        );

    // Player อยู่ด้านไหนของ Box
    //
    // -1 = ซ้าย
    //  1 = ขวา
    const grabSideRef =
        useRef<-1 | 1>(-1);

    // ระยะตอนเริ่มจับ
    const grabDistanceRef =
        useRef(1);

    // ============================
    // UI State
    // ============================

    const [
        isPlayerNear,
        setIsPlayerNear,
    ] = useState(false);

    const [
        isGrabbed,
        setIsGrabbed,
    ] = useState(false);

    const [
        isPlaced,
        setIsPlaced,
    ] = useState(false);

    /*
     * ใช้ Ref คู่กับ State
     * เพราะ keyboard / physics
     * ต้องอ่านค่าปัจจุบันทันที
     */
    const isGrabbedRef =
        useRef(false);

    /*
     * Player มี Collider หลายตัว
     * เลยจำ collider ที่อยู่ใน
     * Sensor ไว้ทั้งหมด
     */
    const playerColliders =
        useRef<Set<number>>(
            new Set(),
        );

    const isPlacedRef = useRef(false);

    // ============================
    // E = Grab / Release
    // ============================

    useEffect(() => {
        const handleKeyDown = (
            event: KeyboardEvent,
        ) => {
            if (event.code !== "KeyE") {
                return;
            }

            /*
             * ป้องกันการกดค้าง E
             * แล้ว browser ยิง keydown
             * ซ้ำ ๆ
             */
            if (event.repeat) {
                return;
            }

            const box = bodyRef.current;

            if (!box) {
                return;
            }

            // วางสำเร็จแล้ว ห้ามจับซ้ำ
            if (isPlacedRef.current) {
                return;
            }

            // ========================
            // กำลังจับอยู่
            // → กด E = ปล่อย
            // ========================

            if (isGrabbedRef.current) {
                isGrabbedRef.current =
                    false;

                setIsGrabbed(false);

                grabbedPlayerRef.current =
                    null;

                if (
                    playerColliders.current
                        .size === 0
                ) {
                    nearbyPlayerRef.current =
                        null;
                }

                const velocity =
                    box.linvel();

                /*
                 * ปล่อยแล้วหยุด
                 * ความเร็วแนวนอนของ Box
                 */
                box.setLinvel(
                    {
                        x: 0,
                        y: velocity.y,
                        z: 0,
                    },
                    true,
                );

                return;
            }

            // ========================
            // ยังไม่ได้จับ
            // ========================

            if (
                playerColliders.current
                    .size === 0
            ) {
                return;
            }

            const player =
                nearbyPlayerRef.current;

            if (!player) {
                return;
            }

            const playerPosition =
                player.translation();

            const boxPosition =
                box.translation();

            // ========================
            // จำว่า Player อยู่ด้านไหน
            // ========================

            grabSideRef.current =
                playerPosition.x <
                    boxPosition.x
                    ? -1
                    : 1;

            // ========================
            // จำระยะปัจจุบัน
            //
            // จะได้ไม่ snap ตอนกด E
            // ========================

            grabDistanceRef.current =
                clamp(
                    Math.abs(
                        boxPosition.x -
                        playerPosition.x,
                    ),
                    MIN_GRAB_DISTANCE,
                    MAX_GRAB_DISTANCE,
                );

            grabbedPlayerRef.current =
                player;

            isGrabbedRef.current = true;

            setIsGrabbed(true);
        };

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );
        };
    }, []);

    // ============================
    // Box Follow Player
    // ============================

    useBeforePhysicsStep((world: PhysicsStep) => {
        const box = bodyRef.current;

        if (!box) {
            return;
        }

        const boxPosition =
            box.translation();

        const physicsDelta = Math.min(
            world.timestep,
            1 / 30,
        );

        // ============================
        // 1. กล่องถูกวางเข้าจุดแล้ว
        // ============================

        if (isPlacedRef.current) {
            const maxDistance =
                BOX_FINAL_MOVE_SPEED *
                physicsDelta;

            const nextX = moveTowards(
                boxPosition.x,
                BOX_TARGET_X,
                maxDistance,
            );

            const nextZ = moveTowards(
                boxPosition.z,
                PLAYER_LANE_Z,
                maxDistance,
            );

            /*
             * Kinematic translation ทำให้ Rapier
             * รับรู้ความเร็วและการชนระหว่างทาง
             * ต่างจาก setTranslation ที่เป็นการวาร์ป
             */
            box.setNextKinematicTranslation(
                {
                    x: nextX,
                    y: boxPosition.y,
                    z: nextZ,
                },
            );

            return;
        }

        /*
         * Sensor และข้อความ E ต้องอยู่ที่ lane Z = 0
         * แม้ตัวกล่องกำลังค่อย ๆ เลื่อนเข้ามา
         */
        const laneOffsetZ =
            PLAYER_LANE_Z - boxPosition.z;

        interactionSensorRef.current
            ?.setTranslationWrtParent({
                x: 0,
                y: 0,
                z: laneOffsetZ,
            });

        if (promptAnchorRef.current) {
            promptAnchorRef.current.position.z =
                laneOffsetZ;
        }

        // ============================
        // 2. ถ้ายังไม่ได้จับ
        //    ไม่ต้อง Follow Player
        // ============================

        if (!isGrabbedRef.current) {
            return;
        }

        const player =
            grabbedPlayerRef.current;

        if (!player) {
            return;
        }

        const playerPosition =
            player.translation();

        const playerVelocity =
            player.linvel();

        const boxVelocity =
            box.linvel();

        // ============================
        // 3. ค่อย ๆ เข้า Player lane
        //    ตามระยะที่ดันจริง
        // ============================

        const placementProgress =
            getPlacementProgress(
                boxPosition.x,
                position[0],
            );

        // Smoothstep ลดอาการกระชากช่วงเริ่ม/จบ
        const easedProgress =
            placementProgress *
            placementProgress *
            (3 - 2 * placementProgress);

        const targetBoxZ =
            position[2] +
            (PLAYER_LANE_Z - position[2]) *
                easedProgress;

        const targetVelocityZ = clamp(
            (targetBoxZ - boxPosition.z) *
                BOX_LANE_FOLLOW_STRENGTH,
            -BOX_LANE_MOVE_SPEED,
            BOX_LANE_MOVE_SPEED,
        );

        // ============================
        // 4. ถึงตำแหน่งที่กำหนดใน Map
        // ============================

        const isTargetOnRight =
            BOX_TARGET_X >= position[0];

        const reachedTargetX =
            isTargetOnRight
                ? boxPosition.x >=
                  BOX_TARGET_X -
                      BOX_TARGET_TOLERANCE
                : boxPosition.x <=
                  BOX_TARGET_X +
                      BOX_TARGET_TOLERANCE;

        if (reachedTargetX) {
            isPlacedRef.current = true;
            setIsPlaced(true);

            // ปล่อยมือ
            isGrabbedRef.current = false;

            setIsGrabbed(false);

            grabbedPlayerRef.current =
                null;

            nearbyPlayerRef.current = null;
            playerColliders.current.clear();
            setIsPlayerNear(false);

            interactionSensorRef.current
                ?.setEnabled(false);

            /*
             * เก็บตำแหน่งช่วงท้ายแบบ Kinematic
             * เพื่อไม่ให้ X/Z snap และไม่วาร์ป
             * collider ผ่าน Player
             */
            box.setBodyType(
                rapier.RigidBodyType
                    .KinematicPositionBased,
                true,
            );

            box.setNextKinematicTranslation(
                boxPosition,
            );

            return;
        }

        // ============================
        // 5. Box Follow Player
        // ============================

        const targetBoxX =
            playerPosition.x -
            grabSideRef.current *
            grabDistanceRef.current;

        const positionError =
            targetBoxX -
            boxPosition.x;

        const targetVelocityX =
            playerVelocity.x +
            positionError *
            FOLLOW_STRENGTH;

        const finalVelocityX =
            clamp(
                targetVelocityX,
                -MAX_FOLLOW_SPEED,
                MAX_FOLLOW_SPEED,
            );

        box.setLinvel(
            {
                x: finalVelocityX,
                y: boxVelocity.y,
                z: targetVelocityZ,
            },
            true,
        );
    });

    return (
        <RigidBody
            ref={bodyRef}
            type={
                isPlaced
                    ? "kinematicPosition"
                    : "dynamic"
            }
            position={position}

            // ระหว่างดันให้ Box ค่อย ๆ เข้า Z = 0
            enabledTranslations={[
                true,
                true,
                true,
            ]}

            enabledRotations={[
                false,
                false,
                false,
            ]}

            ccd
            colliders={false}
        >
            {/* ========================
          Box Visual

          กล่องอยู่ด้านหลัง
          Player lane
      ======================== */}

            <mesh
                castShadow
                receiveShadow
            >
                <boxGeometry
                    args={[
                        1.2,
                        1.2,
                        0.5,
                    ]}
                />

                <meshStandardMaterial
                    roughness={0.8}
                />
            </mesh>

            {/* ========================
          Box Physics Collider

          ทำให้บางในแกน Z
          เพื่อไม่ชน Player
      ======================== */}

            <CuboidCollider
                args={[
                    0.6,
                    0.6,
                    0.25,
                ]}
                friction={1}
                restitution={0}
            />

            {/* ========================
          Interaction Sensor

          Sensor รักษาตำแหน่งโลกไว้ที่ Z = 0
          ซึ่งเป็น lane ของ Player
      ======================== */}

            <CuboidCollider
                ref={interactionSensorRef}
                args={[
                    1.25,
                    0.85,
                    0.5,
                ]}
                position={[
                    0,
                    0,
                    PLAYER_LANE_Z -
                        position[2],
                ]}
                sensor
                density={0}

                onIntersectionEnter={({ other }: RapierIntersectionEvent) => {
                    if (isPlacedRef.current) {
                        return;
                    }

                    if (
                        other.rigidBodyObject
                            ?.name !== "player"
                    ) {
                        return;
                    }

                    playerColliders.current.add(
                        other.collider.handle,
                    );

                    if (other.rigidBody) {
                        nearbyPlayerRef.current =
                            other.rigidBody;
                    }

                    setIsPlayerNear(true);
                }}

                onIntersectionExit={({ other }: RapierIntersectionEvent) => {
                    if (isPlacedRef.current) {
                        return;
                    }

                    if (
                        other.rigidBodyObject
                            ?.name !== "player"
                    ) {
                        return;
                    }

                    playerColliders.current.delete(
                        other.collider.handle,
                    );

                    if (
                        playerColliders.current
                            .size === 0
                    ) {
                        setIsPlayerNear(false);

                        /*
                         * สำคัญ:
                         *
                         * ถ้าจับอยู่
                         * ห้ามปล่อยกล่องอัตโนมัติ
                         *
                         * ต้องกด E เท่านั้น
                         */
                        if (
                            !isGrabbedRef.current
                        ) {
                            nearbyPlayerRef.current =
                                null;
                        }
                    }
                }}
            />

            {/* ========================
          UI
      ======================== */}

            {!isPlaced &&
                (isPlayerNear ||
                    isGrabbed) && (
                    <group
                        ref={promptAnchorRef}
                        position={[
                            0,
                            1.3,
                            PLAYER_LANE_Z -
                                position[2],
                        ]}
                    >
                        <Html center>
                            <div
                                className="
              whitespace-nowrap
              rounded-md
              bg-black/80
              px-3
              py-2
              text-sm
              text-white
              select-none
              pointer-events-none
            "
                            >
                                {isGrabbed ? (
                                    <>
                                        <span className="font-bold">
                                            E
                                        </span>
                                        {" "}
                                        ปล่อย
                                    </>
                                ) : (
                                    <>
                                        <span className="font-bold">
                                            E
                                        </span>
                                        {" "}
                                        จับ
                                    </>
                                )}
                            </div>
                        </Html>
                    </group>
                )}
        </RigidBody>
    );
}
