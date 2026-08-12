"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    useFrame,
    useThree,
} from "@react-three/fiber";
import {
    CapsuleCollider,
    CuboidCollider,
    RigidBody,
    useRapier,
    type RapierCollider,
    type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";

import PlayerModel, {
    type PlayerAnimation,
} from "./PlayerModel";
import { useGameContext } from "./GameContext";

type RapierIntersectionEvent = {
    other: { collider: RapierCollider };
};

// ==============================
// Movement
// ==============================

const JOG_SPEED = 5.5;
const RUN_SPEED = 10.5;
const CROUCH_SPEED = 2.5;

const JUMP_SPEED = 8;
// เริ่ม Landing ก่อนเท้าแตะพื้นกี่หน่วย
const LAND_PREP_DISTANCE = 0;
// ระยะจากจุดกึ่งกลาง RigidBody ถึงเท้า
const PLAYER_FOOT_OFFSET = 0.9;
// เล่น Landing นานประมาณกี่วินาที
const LAND_DURATION = 0.25;

// เริ่ม Falling เมื่อความเร็วกำลังลงแล้ว
const FALL_START_VELOCITY = -0.5;
// ระยะเวลาเตรียมตัวก่อน Physics กระโดดจริง
const JUMP_PREPARE_TIME = 0.12;

// ==============================
// Camera
// ==============================

// กล้องห่างจากฉากแค่ไหน
const CAMERA_DISTANCE = 13;

// ความสูงกล้องเหนือ Player
const CAMERA_HEIGHT = 2.5;

// กล้องมองสูงกว่าจุดกลาง Player เล็กน้อย
const CAMERA_TARGET_HEIGHT = 0.7;

// มองล่วงหน้าตอนเดิน
const WALK_LOOK_AHEAD = 1.2;

// มองล่วงหน้าเพิ่มตอนวิ่ง
const RUN_LOOK_AHEAD = 2;

// ความเร็วในการตาม Player
const CAMERA_FOLLOW_SPEED = 4;

// ความเร็วตอนเปลี่ยน Look Ahead
const LOOK_AHEAD_SPEED = 5;

// Y ใช้ช้ากว่า X
// เพื่อไม่ให้กล้องเด้งตาม Jump แบบแข็ง ๆ
const CAMERA_VERTICAL_SPEED = 2.5;

// ==============================
// Standing Collider
// ==============================

const PLAYER_RADIUS = 0.35;

const STANDING_HALF_HEIGHT = 0.55;

// ==============================
// Crouching Collider
// ==============================

const CROUCHING_HALF_HEIGHT = 0.2;

/*
 * ตอนย่อ เราไม่อยากให้ก้น Capsule ลอยขึ้น
 *
 * เลยขยับ Collider ลง
 *
 * standing = 0.55
 * crouch   = 0.20
 *
 * offset = 0.20 - 0.55
 *        = -0.35
 */
const CROUCH_COLLIDER_OFFSET_Y =
    CROUCHING_HALF_HEIGHT -
    STANDING_HALF_HEIGHT;

const INACTIVE_COLLISION_GROUPS = 0;

// ==============================
// Keyboard
// ==============================

type KeyboardState = {
    left: boolean;
    right: boolean;
    run: boolean;
    crouch: boolean;
};

export default function Player() {
    const { camera } = useThree();
    const cameraRef = useRef(camera);
    const { playerPosition } = useGameContext();

    useEffect(() => {
        cameraRef.current = camera;
    }, [camera]);
    const { world, rapier } = useRapier();

    const cameraLookAhead = useRef(0);

    const cameraInitialized = useRef(false);

    const desiredCameraPosition =
        useRef(new THREE.Vector3());

    const desiredCameraTarget =
        useRef(new THREE.Vector3());

    const currentCameraTarget =
        useRef(new THREE.Vector3());

    const bodyRef =
        useRef<RapierRigidBody>(null);

    const standingColliderRef =
        useRef<RapierCollider>(null);

    const crouchingColliderRef =
        useRef<RapierCollider>(null);

    const visualRef =
        useRef<THREE.Group>(null);

    // ==============================
    // Player State
    // ==============================

    const groundContacts = useRef(0);

    /*
     * Sensor บริเวณเหนือหัว
     *
     * ถ้า > 0 แสดงว่ามีเพดาน
     * จึงยังลุกไม่ได้
     */
    const ceilingContacts = useRef(0);

    const jumpQueued = useRef(false);

    const isCrouching = useRef(false);

    const isPreparingJump = useRef(false);
    const jumpPrepareTimer = useRef(0);

    /*
 * ใช้ตรวจ transition:
 *
 * airborne -> grounded
 *
 * เพื่อรู้ว่า "เพิ่งลงถึงพื้น"
 */
    const wasGrounded = useRef(true);

    /*
 * true = airborne เพราะกด Space
 * false = airborne เพราะเดินตกขอบ
 */
    const didJump = useRef(false);

    /*
     * จำว่าตอนกระโดดเริ่มจากการวิ่งหรือไม่
     *
     * true  = RunJump
     * false = Jump
     */
    const jumpStartedRunning = useRef(false);

    /*
     * Landing state
     */
    const landingTimer = useRef(0);

    const setCrouchingColliderRef =
        useCallback((collider: RapierCollider | null) => {
            crouchingColliderRef.current = collider;

            if (!collider) {
                return;
            }

            if (isCrouching.current) {
                collider.setEnabled(true);
            } else {
                collider.setCollisionGroups(
                    INACTIVE_COLLISION_GROUPS,
                );
                collider.setEnabled(false);
            }
        }, []);


    const keys = useRef<KeyboardState>({
        left: false,
        right: false,
        run: false,
        crouch: false,
    });

    const [
        animation,
        setAnimation,
    ] = useState<PlayerAnimation>(
        "Idle",
    );

    const currentAnimation =
        useRef<PlayerAnimation>("Idle");

    function changeAnimation(
        nextAnimation: PlayerAnimation,
    ) {
        if (
            currentAnimation.current ===
            nextAnimation
        ) {
            return;
        }

        currentAnimation.current =
            nextAnimation;

        setAnimation(nextAnimation);
    }

    // ==============================
    // Keyboard Input
    // ==============================

    useEffect(() => {
        function handleKeyDown(
            event: KeyboardEvent,
        ) {
            switch (event.code) {
                case "KeyA":
                case "ArrowLeft":
                    keys.current.left = true;
                    break;

                case "KeyD":
                case "ArrowRight":
                    keys.current.right = true;
                    break;

                case "ShiftLeft":
                case "ShiftRight":
                    keys.current.run = true;
                    break;

                case "KeyC":
                case "ControlLeft":
                case "ControlRight":
                    event.preventDefault();
                    keys.current.crouch = true;
                    break;

                case "Space":
                    event.preventDefault();

                    if (!event.repeat) {
                        jumpQueued.current = true;
                    }

                    break;
            }
        }

        function handleKeyUp(
            event: KeyboardEvent,
        ) {
            switch (event.code) {
                case "KeyA":
                case "ArrowLeft":
                    keys.current.left = false;
                    break;

                case "KeyD":
                case "ArrowRight":
                    keys.current.right = false;
                    break;

                case "ShiftLeft":
                case "ShiftRight":
                    keys.current.run = false;
                    break;

                case "KeyC":
                case "ControlLeft":
                case "ControlRight":
                    keys.current.crouch = false;
                    break;
            }
        }

        function handleBlur() {
            keys.current.left = false;
            keys.current.right = false;
            keys.current.run = false;
            keys.current.crouch = false;

            jumpQueued.current = false;
        }

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        window.addEventListener(
            "keyup",
            handleKeyUp,
        );

        window.addEventListener(
            "blur",
            handleBlur,
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );

            window.removeEventListener(
                "keyup",
                handleKeyUp,
            );

            window.removeEventListener(
                "blur",
                handleBlur,
            );
        };
    }, []);

    // ==============================
    // เปลี่ยน Standing / Crouch
    // ==============================

    function setCrouching(
        crouching: boolean,
    ) {
        const standingCollider =
            standingColliderRef.current;

        const crouchingCollider =
            crouchingColliderRef.current;

        const body = bodyRef.current;

        if (
            !standingCollider ||
            !crouchingCollider ||
            !body
        ) {
            return;
        }

        /*
         * สลับ Collider คนละตัวแทนการเปลี่ยน Shape
         * ของ Collider ที่กำลังสัมผัสพื้น
         *
         * ตัด Collision Group ก่อนปิด เพื่อไม่ให้ Rapier
         * นำ Contact เก่าของ Collider ที่ปิดแล้วไปคำนวณต่อ
         */
        if (crouching) {
            const collisionGroups =
                standingCollider.collisionGroups();

            crouchingCollider.setCollisionGroups(
                collisionGroups,
            );
            crouchingCollider.setEnabled(true);

            standingCollider.setCollisionGroups(
                INACTIVE_COLLISION_GROUPS,
            );
            standingCollider.setEnabled(false);
        } else {
            const collisionGroups =
                crouchingCollider.collisionGroups();

            standingCollider.setCollisionGroups(
                collisionGroups,
            );
            standingCollider.setEnabled(true);

            crouchingCollider.setCollisionGroups(
                INACTIVE_COLLISION_GROUPS,
            );
            crouchingCollider.setEnabled(false);
        }

        body.recomputeMassPropertiesFromColliders();
        body.wakeUp();

        isCrouching.current = crouching;
    }

    // ==============================
    // Game Loop
    // ==============================

    useFrame((_, delta) => {
        const body = bodyRef.current;

        if (!body) {
            return;
        }

        console.log(body.translation());

        const safeDelta = Math.min(
            delta,
            0.1,
        );

        // ============================
        // Crouch
        // ============================

        /*
         * กด C → ย่อ
         */
        if (
            keys.current.crouch &&
            !isCrouching.current
        ) {
            setCrouching(true);
        }

        /*
         * ปล่อย C → พยายามลุก
         */
        if (
            !keys.current.crouch &&
            isCrouching.current
        ) {
            /*
             * ถ้าไม่มีอะไรอยู่เหนือหัว
             * ถึงจะยืนได้
             */
            if (ceilingContacts.current === 0) {
                setCrouching(false);
            }
        }

        // ============================
        // Direction
        // ============================

        let direction = 0;

        if (keys.current.left) {
            direction -= 1;
        }

        if (keys.current.right) {
            direction += 1;
        }

        const isMoving =
            direction !== 0;

        // ============================
        // Speed
        // ============================

        let maxSpeed = JOG_SPEED;

        /*
         * ตอนย่อให้เดินช้า
         * ต่อให้กด Shift ก็ไม่วิ่ง
         */
        if (isCrouching.current) {
            maxSpeed = CROUCH_SPEED;
        } else if (keys.current.run) {
            maxSpeed = RUN_SPEED;
        }

        const targetVelocityX =
            direction * maxSpeed;

        const currentVelocity =
            body.linvel();

        /*
         * acceleration / deceleration
         */
        const movementSmoothing =
            1 - Math.exp(-14 * safeDelta);

        let velocityX =
            THREE.MathUtils.lerp(
                currentVelocity.x,
                targetVelocityX,
                movementSmoothing,
            );

        let velocityY =
            currentVelocity.y;

        // ============================
        // Jump
        // ============================

        const groundedBeforeJump =
            groundContacts.current > 0;

        let jumpedThisFrame = false;

        /*
         * กด Space
         *
         * ยังไม่กระโดดทันที
         * แค่เริ่มเล่นช่วงเตรียม Jump
         */
        if (
            jumpQueued.current &&
            groundedBeforeJump &&
            !isCrouching.current &&
            !isPreparingJump.current
        ) {
            isPreparingJump.current = true;

            jumpPrepareTimer.current =
                JUMP_PREPARE_TIME;

            /*
             * จำว่าตอนเริ่มเตรียมกระโดด
             * กำลังวิ่งหรือไม่
             */
            jumpStartedRunning.current =
                keys.current.run &&
                isMoving;

            /*
             * บอกระบบว่า Jump รอบนี้
             * เกิดจากการกด Space
             */
            didJump.current = true;

            landingTimer.current = 0;
        }

        jumpQueued.current = false;

        /*
         * กำลังเล่นช่วงเตรียมกระโดด
         */
        if (isPreparingJump.current) {
            jumpPrepareTimer.current -=
                safeDelta;

            /*
             * ถึงจังหวะ Takeoff
             */
            if (
                jumpPrepareTimer.current <= 0
            ) {
                velocityY = JUMP_SPEED;

                isPreparingJump.current = false;

                jumpedThisFrame = true;

                /*
                 * กัน Double Jump
                 */
                groundContacts.current = 0;
            }
        }

        const animationGrounded =
            jumpedThisFrame
                ? false
                : groundContacts.current > 0;

        // ============================
        // ตรวจพื้นล่วงหน้าสำหรับ Landing
        // ============================

        let shouldPreLand = false;

        if (
            !animationGrounded &&
            velocityY < 0
        ) {
            const playerPosition =
                body.translation();

            const ray = new rapier.Ray(
                {
                    x: playerPosition.x,
                    y: playerPosition.y,
                    z: playerPosition.z,
                },
                {
                    x: 0,
                    y: -1,
                    z: 0,
                },
            );

            const maxRayDistance =
                PLAYER_FOOT_OFFSET +
                LAND_PREP_DISTANCE;

            const hit = world.castRay(
                ray,
                maxRayDistance,
                true,
                undefined,
                undefined,
                undefined,

                // ไม่ให้ Ray ชน Player เอง
                body,
            );

            if (hit) {
                const distanceFromFeet =
                    hit.timeOfImpact -
                    PLAYER_FOOT_OFFSET;

                shouldPreLand =
                    distanceFromFeet <=
                    LAND_PREP_DISTANCE;
            }
        }

        // ============================
        // Landing Detection
        // ============================

        /*
         * frame ก่อนหน้า = airborne
         * frame ปัจจุบัน = grounded
         *
         * แปลว่าเพิ่งแตะพื้น
         */
        const justLanded =
            !wasGrounded.current &&
            animationGrounded;

        if (justLanded) {
            landingTimer.current =
                LAND_DURATION;

            /*
             * Jump รอบนี้จบแล้ว
             */
            didJump.current = false;

            jumpStartedRunning.current =
                false;
        }

        /*
         * ลดเวลา Landing
         */
        if (landingTimer.current > 0) {
            landingTimer.current =
                Math.max(
                    0,
                    landingTimer.current -
                    safeDelta,
                );
        }

        // ============================
        // Animation State
        // ============================

        let nextAnimation:
            PlayerAnimation;

        const isRunning =
            isMoving &&
            keys.current.run &&
            !isCrouching.current;

        const isJogging =
            isMoving &&
            !keys.current.run &&
            !isCrouching.current;

        // ============================
        // 0. Jump Preparation
        // ============================

        if (isPreparingJump.current) {
            nextAnimation =
                jumpStartedRunning.current
                    ? "RunningJump"
                    : "Jump";
        }

        // ============================
        // 1. Landing
        // ============================

        else if (
            shouldPreLand ||
            (
                animationGrounded &&
                landingTimer.current > 0
            )
        ) {
            nextAnimation = "Landing";
        }

        // ============================
        // 2. Airborne
        // ============================

        else if (!animationGrounded) {
            /*
             * เริ่มตกลงแล้ว
             */
            if (
                velocityY <= FALL_START_VELOCITY
            ) {
                nextAnimation = "Falling";
            }

            /*
             * ยังพุ่งขึ้นจากการกระโดด
             */
            else if (
                didJump.current &&
                jumpStartedRunning.current
            ) {
                nextAnimation = "RunningJump";
            }

            /*
             * Jump ธรรมดา
             */
            else {
                nextAnimation = "Jump";
            }
        }

        // ============================
        // 3. Crouch
        // ============================

        else if (isCrouching.current) {
            if (isMoving) {
                nextAnimation =
                    "CrouchWalking";
            } else {
                nextAnimation =
                    "Crouch";
            }
        }

        // ============================
        // 4. Run
        // ============================

        else if (isRunning) {
            nextAnimation = "Run";
        }

        // ============================
        // 5. Jog
        // ============================

        else if (isJogging) {
            nextAnimation = "Jog";
        }

        // ============================
        // 6. Idle
        // ============================

        else {
            nextAnimation = "Idle";
        }

        /*
         * แตะพื้นแล้วหยุดนิ่งจน Landing จบ
         * แต่ไม่ล็อกช่วง Pre-Landing ที่ยังอยู่กลางอากาศ
         */
        if (
            nextAnimation === "Landing" &&
            animationGrounded
        ) {
            velocityX = 0;
        }

        changeAnimation(
            nextAnimation,
        );

        /*
         * เก็บ Grounded ปัจจุบัน
         * เพื่อเทียบ frame หน้า
         *
         * ต้องอยู่หลัง justLanded
         */
        wasGrounded.current =
            animationGrounded;

        // ============================
        // Apply Velocity
        // ============================

        body.setLinvel(
            {
                x: velocityX,
                y: velocityY,

                /*
                 * Side-scroller
                 * ล็อกความลึก
                 */
                z: 0,
            },
            true,
        );

        // ============================
        // หันซ้าย / ขวา
        // ============================

        if (visualRef.current && isMoving) {
            if (direction > 0) {
                // เดินขวา
                visualRef.current.rotation.y =
                    Math.PI / 2;
                // 0;
            }

            if (direction < 0) {
                // เดินซ้าย
                visualRef.current.rotation.y =
                    -Math.PI / 2;
                // Math.PI;
            }
        }

        // ============================
        // Reset เมื่อตก Map
        // ============================

        const position =
            body.translation();

        // ============================
        // Cinematic Side Camera
        // ============================

        /*
         * ถ้าเดินขวา direction = 1
         * ถ้าเดินซ้าย direction = -1
         *
         * กล้องจะมองล่วงหน้าไปยังทิศนั้น
         */
        let targetLookAhead = 0;

        if (isMoving) {
            targetLookAhead =
                direction *
                (
                    keys.current.run
                        ? RUN_LOOK_AHEAD
                        : WALK_LOOK_AHEAD
                );
        }

        /*
         * เวลาเปลี่ยนจากซ้าย → ขวา
         * ไม่ให้กล้องกระชากทันที
         */
        const lookAheadSmoothing =
            1 -
            Math.exp(
                -LOOK_AHEAD_SPEED * safeDelta,
            );

        cameraLookAhead.current =
            THREE.MathUtils.lerp(
                cameraLookAhead.current,
                targetLookAhead,
                lookAheadSmoothing,
            );

        /*
         * จุดที่เราอยากให้กล้องมอง
         */
        desiredCameraTarget.current.set(
            position.x +
            cameraLookAhead.current,

            position.y +
            CAMERA_TARGET_HEIGHT,

            0,
        );

        /*
         * ตำแหน่งกล้องที่ต้องการ
         *
         * X:
         * ตาม Player + Look Ahead เล็กน้อย
         *
         * Y:
         * อยู่เหนือ Player
         *
         * Z:
         * อยู่ด้านหน้าฉากแบบ Side View
         */
        desiredCameraPosition.current.set(
            position.x +
            cameraLookAhead.current * 0.45,

            position.y +
            CAMERA_HEIGHT,

            CAMERA_DISTANCE,
        );

        /*
         * เฟรมแรก
         * ให้กล้องกระโดดไปหาผู้เล่นทันที
         *
         * ไม่งั้นตอนเริ่มเกมจะเห็นกล้อง
         * ค่อย ๆ บินจาก [0, 4, 14]
         * ไปหา Player ที่ x = -10
         */
        if (!cameraInitialized.current) {
            cameraRef.current.position.copy(
                desiredCameraPosition.current,
            );

            currentCameraTarget.current.copy(
                desiredCameraTarget.current,
            );

            cameraInitialized.current = true;
        }

        /*
         * X/Z ตามเร็วกว่า
         */
        const horizontalSmoothing =
            1 -
            Math.exp(
                -CAMERA_FOLLOW_SPEED *
                safeDelta,
            );


        // Update X and Z using local vars then set once
        const newX = THREE.MathUtils.lerp(
            cameraRef.current.position.x,
            desiredCameraPosition.current.x,
            horizontalSmoothing,
        );

        const newZ = THREE.MathUtils.lerp(
            cameraRef.current.position.z,
            desiredCameraPosition.current.z,
            horizontalSmoothing,
        );

        /*
         * Y ตามช้ากว่า
         *
         * เวลา Player กระโดด
         * กล้องจะไม่เด้งขึ้นทันที
         */
        const verticalSmoothing =
            1 -
            Math.exp(
                -CAMERA_VERTICAL_SPEED *
                safeDelta,
            );

        const newY = THREE.MathUtils.lerp(
            cameraRef.current.position.y,
            desiredCameraPosition.current.y,
            verticalSmoothing,
        );

        cameraRef.current.position.set(newX, newY, newZ);

        /*
         * จุดที่กล้องมองก็นุ่มเหมือนกัน
         */
        currentCameraTarget.current.x =
            THREE.MathUtils.lerp(
                currentCameraTarget.current.x,
                desiredCameraTarget.current.x,
                horizontalSmoothing,
            );

        currentCameraTarget.current.y =
            THREE.MathUtils.lerp(
                currentCameraTarget.current.y,
                desiredCameraTarget.current.y,
                verticalSmoothing,
            );

        currentCameraTarget.current.z = 0;

        /*
         * หมุนกล้องไปยัง Target
         */
        cameraRef.current.lookAt(
            currentCameraTarget.current,
        );

        // Update player position for enemies
        playerPosition.current.set(
            position.x,
            position.y,
            position.z,
        );

        if (position.y < -10) {
            body.setTranslation(
                {
                    x: -10,
                    y: 2,
                    z: 0,
                },
                true,
            );

            body.setLinvel(
                {
                    x: 0,
                    y: 0,
                    z: 0,
                },
                true,
            );

            setCrouching(false);
        }
    });

    return (
        <RigidBody
            ref={bodyRef}
            name="player"
            position={[-10, 2, 0]}
            colliders={false}
            lockRotations
            enabledTranslations={[
                true,
                true,
                false,
            ]}
            ccd
            canSleep={false}
            linearDamping={1}
        >
            {/* Collider ตอนยืน */}
            <CapsuleCollider
                ref={standingColliderRef}
                args={[
                    STANDING_HALF_HEIGHT,
                    PLAYER_RADIUS,
                ]}
                friction={0}
            />

            {/* Collider ตอนย่อ */}
            <CapsuleCollider
                ref={setCrouchingColliderRef}
                args={[
                    CROUCHING_HALF_HEIGHT,
                    PLAYER_RADIUS,
                ]}
                position={[
                    0,
                    CROUCH_COLLIDER_OFFSET_Y,
                    0,
                ]}
                friction={0}
            />

            {/* Ground Sensor */}
            <CuboidCollider
                args={[
                    0.22,
                    0.06,
                    0.22,
                ]}
                position={[
                    0,
                    -0.94,
                    0,
                ]}
                sensor
                onIntersectionEnter={({ other }: RapierIntersectionEvent) => {
                    // Interaction Sensor ต่าง ๆ
                    // ไม่นับเป็นพื้น
                    if (other.collider.isSensor()) {
                        return;
                    }

                    groundContacts.current += 1;
                }}

                onIntersectionExit={({ other }: RapierIntersectionEvent) => {
                    if (other.collider.isSensor()) {
                        return;
                    }

                    groundContacts.current =
                        Math.max(
                            0,
                            groundContacts.current - 1,
                        );
                }}
            />

            {/* Ceiling Sensor */}
            <CuboidCollider
                args={[
                    0.2,
                    0.3,
                    0.2,
                ]}
                position={[
                    0,
                    0.55,
                    0,
                ]}
                sensor
                onIntersectionEnter={({ other }: RapierIntersectionEvent) => {
                    // Sensor อื่นไม่ถือเป็นเพดาน
                    if (other.collider.isSensor()) {
                        return;
                    }

                    ceilingContacts.current += 1;
                }}
                onIntersectionExit={({ other }: RapierIntersectionEvent) => {
                    if (other.collider.isSensor()) {
                        return;
                    }

                    ceilingContacts.current =
                        Math.max(
                            0,
                            ceilingContacts.current - 1,
                        );
                }}
            />

            {/* ตัวละครจริง */}
            <group ref={visualRef}>
                <PlayerModel
                    animation={animation}
                />
            </group>
        </RigidBody>
    );
}
