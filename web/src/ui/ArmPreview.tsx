import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Joints } from '../arm/joints';

const D = Math.PI / 180;

/** Approximate SO-ARM101 link lengths in metres. */
const BASE_H = 0.07;
const UPPER = 0.116;
const FORE = 0.135;
const WRIST = 0.05;

const LOOK_AT: [number, number, number] = [0, 0.19, 0];
const CAMERA_START: [number, number, number] = [0.6, 0.42, 0.6];

type Look = 'solid' | 'ghost' | 'target';

interface ArmProps {
  joints: Joints;
  color: string;
  look: Look;
  highlight?: number | null;
}

/** A servo motor: dark box, glows when its joint is highlighted. */
function Servo({ lit, look, size = [0.024, 0.032, 0.045] as [number, number, number] }: { lit: boolean; look: Look; size?: [number, number, number] }) {
  return (
    <mesh castShadow={look === 'solid'}>
      <boxGeometry args={size} />
      <Material color={lit ? '#ffd23f' : '#2b2a33'} look={look} emissive={lit ? '#ffb300' : undefined} />
    </mesh>
  );
}

function Material({ color, look, emissive }: { color: string; look: Look; emissive?: string }) {
  if (look === 'solid') {
    return <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.6 : 0} />;
  }
  return <meshStandardMaterial color={color} transparent opacity={look === 'target' ? 0.3 : 0.22} depthWrite={false} />;
}

function Link({ length, width, color, look }: { length: number; width: number; color: string; look: Look }) {
  return (
    <mesh position={[0, length / 2, 0]} castShadow={look === 'solid'}>
      <boxGeometry args={[width, length, width * 1.15]} />
      <Material color={color} look={look} />
    </mesh>
  );
}

function ArmModel({ joints, color, look, highlight }: ArmProps) {
  const [pan, lift, elbow, wristFlex, wristRoll, grip] = joints;
  const lit = (i: number) => look === 'solid' && highlight === i;
  const jaw = (grip / 100) * 40 * D;
  return (
    <group>
      {/* Base plate (doesn't spin) */}
      <mesh position={[0, 0.006, 0]} receiveShadow castShadow={look === 'solid'}>
        <boxGeometry args={[0.11, 0.012, 0.11]} />
        <Material color={color} look={look} />
      </mesh>
      <group rotation={[0, pan * D, 0]}>
        <mesh position={[0, BASE_H / 2 + 0.012, 0]} castShadow={look === 'solid'}>
          <cylinderGeometry args={[0.032, 0.04, BASE_H - 0.012, 32]} />
          <Material color={color} look={look} />
        </mesh>
        <group position={[0, 0.03, 0]}>
          <Servo lit={lit(0)} look={look} size={[0.045, 0.03, 0.032]} />
        </group>
        {/* Shoulder: 0° = upper arm straight up */}
        <group position={[0, BASE_H + 0.012, 0]} rotation={[0, 0, -lift * D]}>
          <Servo lit={lit(1)} look={look} />
          <Link length={UPPER} width={0.026} color={color} look={look} />
          {/* Elbow: 0° = forearm pointing forward */}
          <group position={[0, UPPER, 0]} rotation={[0, 0, (-90 - elbow) * D]}>
            <Servo lit={lit(2)} look={look} />
            <Link length={FORE} width={0.024} color={color} look={look} />
            <group position={[0, FORE, 0]} rotation={[0, 0, -wristFlex * D]}>
              <Servo lit={lit(3)} look={look} />
              <group rotation={[0, wristRoll * D, 0]}>
                <group position={[0, WRIST * 0.55, 0]}>
                  <Servo lit={lit(4)} look={look} size={[0.032, 0.028, 0.026]} />
                </group>
                <Link length={WRIST} width={0.02} color={color} look={look} />
                {/* Fixed jaw and moving jaw */}
                <mesh position={[-0.013, WRIST + 0.028, 0]} castShadow={look === 'solid'}>
                  <boxGeometry args={[0.007, 0.056, 0.022]} />
                  <Material color={color} look={look} />
                </mesh>
                <group position={[0.013, WRIST, 0]} rotation={[0, 0, -jaw]}>
                  <mesh position={[0, 0.028, 0]} castShadow={look === 'solid'}>
                    <boxGeometry args={[0.007, 0.056, 0.022]} />
                    <Material color={lit(5) ? '#ffd23f' : color} look={look} />
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

/** Drag to spin the view, pinch or scroll to zoom. */
function Controls({ resetKey }: { resetKey: number }) {
  const { camera, gl } = useThree();
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
    return () => c.dispose();
  }, [camera, gl]);
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
}: {
  follower: Joints | null;
  leader: Joints | null;
  target?: Joints | null;
  highlight?: number | null;
  resetKey?: number;
}) {
  const label = follower
    ? `3D view of the follower arm. Base ${Math.round(follower[0])} degrees, hand ${Math.round(follower[5])} percent open. Drag to turn the view.`
    : '3D view. No follower arm connected yet.';
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
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
      <hemisphereLight args={['#ffffff', '#b9b3d6', 1.3]} />
      <directionalLight
        position={[0.6, 1.2, 0.5]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.4}
        shadow-camera-right={0.4}
        shadow-camera-top={0.4}
        shadow-camera-bottom={-0.4}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.45, 64]} />
        <meshStandardMaterial color={dark ? '#2a2838' : '#e9e6f5'} roughness={0.9} />
      </mesh>
      <gridHelper args={[0.9, 18, dark ? '#4a4660' : '#b2adc9', dark ? '#37344a' : '#d4d0e4']} position={[0, 0.0005, 0]} />
      {follower && <ArmModel joints={follower} color="#f2a33a" look="solid" highlight={highlight} />}
      {showTarget && <ArmModel joints={target!} color="#22b573" look="target" />}
      {leader && <ArmModel joints={leader} color="#4f7cff" look="ghost" />}
      <Controls resetKey={resetKey} />
    </Canvas>
  );
}
