import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FORE, HAND, SHOULDER_Y, UPPER, WRIST, tipPosition } from '../arm/ik';
import { Joints } from '../arm/joints';

const D = Math.PI / 180;

const LOOK_AT: [number, number, number] = [0, 0.19, 0];
const CAMERA_START: [number, number, number] = [0.55, 0.38, 0.55];

type Look = 'solid' | 'ghost' | 'target';

interface ArmProps {
  joints: Joints;
  color: string;
  look: Look;
  highlight?: number | null;
}

function Round({ size, radius = 0.006, children, shadow }: { size: [number, number, number]; radius?: number; children: React.ReactNode; shadow?: boolean }) {
  const geo = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius), [size, radius]);
  return (
    <mesh geometry={geo} castShadow={shadow}>
      {children}
    </mesh>
  );
}

/** A servo motor: rounded navy box, glows when its joint is highlighted. */
function Servo({ lit, look, size = [0.03, 0.036, 0.05] as [number, number, number] }: { lit: boolean; look: Look; size?: [number, number, number] }) {
  return (
    <Round size={size} radius={0.008} shadow={look === 'solid'}>
      <Material color={lit ? '#ffd23f' : '#3b4260'} look={look} emissive={lit ? '#ffb300' : undefined} />
    </Round>
  );
}

/** The round hinge cap you see at each joint. */
function Hinge({ look, r = 0.02 }: { look: Look; r?: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={look === 'solid'}>
      <cylinderGeometry args={[r, r, 0.06, 28]} />
      <Material color={look === 'solid' ? '#fffaf0' : '#ffffff'} look={look} />
    </mesh>
  );
}

function Material({ color, look, emissive }: { color: string; look: Look; emissive?: string }) {
  if (look === 'solid') {
    return <meshStandardMaterial color={color} roughness={0.35} metalness={0} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.6 : 0} />;
  }
  return <meshStandardMaterial color={color} transparent opacity={look === 'target' ? 0.3 : 0.22} depthWrite={false} />;
}

function Link({ length, width, color, look }: { length: number; width: number; color: string; look: Look }) {
  return (
    <mesh position={[0, length / 2, 0]} castShadow={look === 'solid'}>
      <capsuleGeometry args={[width * 0.55, Math.max(length - width * 1.1, 0.001), 8, 20]} />
      <Material color={color} look={look} />
    </mesh>
  );
}

function ArmModel({ joints, color, look, highlight }: ArmProps) {
  const [pan, lift, elbow, wristFlex, wristRoll, grip] = joints;
  const lit = (i: number) => look === 'solid' && highlight === i;
  const solid = look === 'solid';
  const jaw = (grip / 100) * 38 * D;
  const accent = solid ? '#fffaf0' : color;
  return (
    <group>
      {/* Round base */}
      <mesh position={[0, 0.008, 0]} receiveShadow castShadow={solid}>
        <cylinderGeometry args={[0.07, 0.078, 0.016, 48]} />
        <Material color={accent} look={look} />
      </mesh>
      <group rotation={[0, pan * D, 0]}>
        <mesh position={[0, 0.03, 0]} castShadow={solid}>
          <cylinderGeometry args={[0.04, 0.05, 0.028, 40]} />
          <Material color={color} look={look} />
        </mesh>
        <mesh position={[0, 0.056, 0]} castShadow={solid}>
          <cylinderGeometry args={[0.03, 0.04, 0.026, 40]} />
          <Material color={lit(0) ? '#ffd23f' : '#3b4260'} look={look} emissive={lit(0) ? '#ffb300' : undefined} />
        </mesh>
        {/* Shoulder: 0 deg = upper arm straight up */}
        <group position={[0, SHOULDER_Y, 0]} rotation={[0, 0, -lift * D]}>
          <Servo lit={lit(1)} look={look} />
          <Hinge look={look} r={0.022} />
          <Link length={UPPER} width={0.03} color={color} look={look} />
          {/* Elbow: 0 deg = forearm pointing forward */}
          <group position={[0, UPPER, 0]} rotation={[0, 0, (-90 - elbow) * D]}>
            <Servo lit={lit(2)} look={look} />
            <Hinge look={look} r={0.02} />
            <Link length={FORE} width={0.027} color={color} look={look} />
            <group position={[0, FORE, 0]} rotation={[0, 0, -wristFlex * D]}>
              <Servo lit={lit(3)} look={look} size={[0.028, 0.032, 0.046]} />
              <Hinge look={look} r={0.017} />
              <group rotation={[0, wristRoll * D, 0]}>
                <group position={[0, WRIST * 0.5, 0]}>
                  <Servo lit={lit(4)} look={look} size={[0.034, 0.03, 0.034]} />
                </group>
                <Link length={WRIST} width={0.022} color={color} look={look} />
                {/* Fixed jaw and moving jaw, with rounded finger tips */}
                <mesh position={[-0.014, WRIST + 0.03, 0]} castShadow={solid}>
                  <capsuleGeometry args={[0.0055, HAND - WRIST - 0.012, 6, 12]} />
                  <Material color={accent} look={look} />
                </mesh>
                <group position={[0.014, WRIST, 0]} rotation={[0, 0, -jaw]}>
                  <mesh position={[0, 0.03, 0]} castShadow={solid}>
                    <capsuleGeometry args={[0.0055, HAND - WRIST - 0.012, 6, 12]} />
                    <Material color={lit(5) ? '#ffd23f' : accent} look={look} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/** The glowing ball on the fingertips: drag it to move the arm, tap it to open/close the hand. */
function Handle({
  joints,
  onGrab,
  onDrag,
  onTap,
}: {
  joints: Joints;
  onGrab: () => boolean;
  onDrag: (p: [number, number, number]) => void;
  onTap: () => void;
}) {
  const { camera, controls } = useThree();
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const drag = useRef<{ plane: THREE.Plane; x: number; y: number; moved: boolean } | null>(null);
  const tip = tipPosition(joints);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const setOrbit = (on: boolean) => {
    if (controls) (controls as unknown as { enabled: boolean }).enabled = on;
  };
  return (
    <group position={tip}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHover(false);
          if (!drag.current) document.body.style.cursor = '';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!onGrab()) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          const n = camera.getWorldDirection(new THREE.Vector3());
          drag.current = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...tip)), x: e.clientX, y: e.clientY, moved: false };
          setOrbit(false);
          setDown(true);
          document.body.style.cursor = 'grabbing';
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
          if (!d.moved) return;
          if (e.ray.intersectPlane(d.plane, hit)) onDrag([hit.x, Math.max(hit.y, 0.025), hit.z]);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          setOrbit(true);
          setDown(false);
          document.body.style.cursor = hover ? 'grab' : '';
          if (d && !d.moved) onTap();
        }}
      >
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh scale={down ? 1.25 : hover ? 1.15 : 1} raycast={() => null}>
        <sphereGeometry args={[0.016, 24, 24]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ffb300" emissiveIntensity={down ? 1.2 : 0.7} />
      </mesh>
      <mesh scale={down ? 1.25 : hover ? 1.15 : 1} raycast={() => null}>
        <sphereGeometry args={[0.028, 24, 24]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Drag to spin the view, pinch or scroll to zoom. */
function Controls({ resetKey }: { resetKey: number }) {
  const { camera, gl, set } = useThree();
  const ref = useRef<OrbitControls>();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(...LOOK_AT);
    c.enablePan = false;
    c.minDistance = 0.25;
    c.maxDistance = 1.3;
    c.maxPolarAngle = Math.PI / 2 - 0.05; // don't go under the table
    c.update();
    ref.current = c;
    set({ controls: c as never });
    return () => {
      set({ controls: null });
      c.dispose();
    };
  }, [camera, gl, set]);
  useEffect(() => {
    if (!resetKey || !ref.current) return;
    camera.position.set(...CAMERA_START);
    ref.current.target.set(...LOOK_AT);
    ref.current.update();
  }, [resetKey, camera]);
  return null;
}

export function ArmPreview({
  follower,
  leader,
  target,
  highlight = null,
  resetKey = 0,
  interact,
}: {
  follower: Joints | null;
  leader: Joints | null;
  target?: Joints | null;
  highlight?: number | null;
  resetKey?: number;
  /** When set, a glowing ball on the follower's fingertips can be dragged or tapped. */
  interact?: { onGrab: () => boolean; onDrag: (p: [number, number, number]) => void; onTap: () => void };
}) {
  const label = follower
    ? `3D view of the follower arm. Base ${Math.round(follower[0])} degrees, hand ${Math.round(follower[5])} percent open. Drag to turn the view.`
    : '3D view. No follower arm connected yet.';
    const showTarget =
    follower && target && target.some((v, i) => Math.abs(v - follower[i]) > 2);
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_START, fov: 42 }}
      dpr={[1, 2]}
      aria-label={label}
      role="img"
    >
      <color attach="background" args={['#dff1ff']} />
      <fog attach="fog" args={['#dff1ff', 1.2, 2.6]} />
      <hemisphereLight args={['#ffffff', '#cfe3f5', 1.6]} />
      <directionalLight
        position={[0.5, 1.1, 0.6]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-radius={6}
        shadow-camera-left={-0.4}
        shadow-camera-right={0.4}
        shadow-camera-top={0.4}
        shadow-camera-bottom={-0.4}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#f6fbff" emissive="#d4e8f8" emissiveIntensity={1} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[0.3, 64]} />
        <meshStandardMaterial color="#ffd9a0" roughness={0.9} />
      </mesh>
      {follower && <ArmModel joints={follower} color="#f2a33a" look="solid" highlight={highlight} />}
      {follower && interact && <Handle joints={follower} {...interact} />}
      {showTarget && <ArmModel joints={target!} color="#22b573" look="target" />}
      {leader && <ArmModel joints={leader} color="#4f7cff" look="ghost" />}
      <Controls resetKey={resetKey} />
    </Canvas>
  );
}
