"use client";

import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";

export default function Map() {
    const { scene } = useGLTF("/map/map.glb");

    useEffect(() => {
        scene.traverse((object: THREE.Object3D) => {
            if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
    }, [scene]);

    return (
        <>
            {/* Map จริง */}
            <RigidBody
                type="fixed"
                colliders="trimesh"
            >
                <primitive object={scene} />
            </RigidBody>

            {/* พื้น Physics ชั่วคราว */}
            <RigidBody
                type="fixed"
                colliders="cuboid"
                includeInvisible
            >
                <mesh
                    position={[0, -0.5, 0]}
                    visible={false}
                >
                    <boxGeometry args={[100, 1, 10]} />
                </mesh>
            </RigidBody>
        </>
    );
}

useGLTF.preload("/map/map.glb");
