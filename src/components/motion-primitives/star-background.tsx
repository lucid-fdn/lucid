"use client";

import { Points, PointMaterial, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import * as random from "maath/random";
import { useState, useRef, Suspense } from "react";
import type { Points as PointsType } from "three";

// Create logo textures from SVGs
const createLogoSVG = (pathData: string) => {
  const svgString = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="24" height="24" fill="transparent"/>
      <path fill="white" d="${pathData}"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
};

// Create a comprehensive set of 25+ logos by duplicating and varying the original 8
const baseLogos = [
  "M5.243 8.375c-1.168 1.334-2.785 2.828-3.173 4.692c-.612 2.938 2.962 2.858 4.697 2.141c5.105-2.11 10.155-4.353 15.233-6.53c-4.937 1.315-9.857 2.699-14.812 3.945c-3.545.892-2.855-2.272-1.945-4.248",
  "M17.05 20.28c-.98.95-2.05.8-3.08.35c-1.09-.46-2.09-.48-3.24 0c-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8c1.18-.24 2.31-.93 3.57-.84c1.51.12 2.65.72 3.4 1.8c-3.12 1.87-2.38 5.98.48 7.13c-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25c.29 2.58-2.34 4.5-3.74 4.25",
  "M8.66 6.897a1.3 1.3 0 0 0-1.205.765l-.642 1.44l-.062-.385A1.29 1.29 0 0 0 5.27 7.648l-4.185.678A1.29 1.29 0 0 0 .016 9.807l.678 4.18a1.29 1.29 0 0 0 1.27 1.087c.074 0 .143-.01.216-.017l4.18-.678c.436-.07.784-.351.96-.723l2.933 1.307a1.3 1.3 0 0 0 .988.026c.321-.12.575-.365.716-.678l.28-.629l.038.276a1.297 1.297 0 0 0 1.455 1.103l3.712-.501a1.29 1.29 0 0 0 1.03.514h4.236c.713 0 1.29-.58 1.291-1.291V9.545c0-.712-.58-1.291-1.291-1.291h-4.236q-.118 0-.23.022a1.3 1.3 0 0 0-.275-.288a1.28 1.28 0 0 0-.958-.253l-4.197.571q-.233.033-.432.14L9.159 7.01a1.3 1.3 0 0 0-.499-.113m-.025.705c.077 0 .159.013.24.052l2.971 1.324c-.128.238-.18.508-.142.782l.357 2.596h.002l-.745 1.672a.59.59 0 0 1-.777.296l-3.107-1.385l-.004-.041l-.41-2.526L8.1 7.95a.59.59 0 0 1 .536-.348zm-3.159.733c.125 0 .245.039.343.112c.13.09.21.227.237.382l.234 1.446l-.56 1.259a1.27 1.27 0 0 0-.026.987c.12.322.364.575.678.717l.295.131a.59.59 0 0 1-.428.314l-4.185.678a.59.59 0 0 1-.674-.485l-.678-4.18a.59.59 0 0 1 .485-.674l4.185-.678c.03-.004.064-.01.094-.01zm11.705.09a.6.6 0 0 1 .415.173a1.3 1.3 0 0 0-.416.947v4.237q.001.05.005.097l-3.55.482a.586.586 0 0 1-.66-.502l-.191-1.403l.899-2.017a1.29 1.29 0 0 0-.333-1.5l3.754-.51q.038-.005.077-.004m1.3.532h4.227c.326 0 .588.266.588.588v4.237a.59.59 0 0 1-.588.588h-4.237a.6.6 0 0 1-.12-.013c.47-.246.758-.765.684-1.318zm-5.988.309l.254.113c.296.133.43.48.296.777l-.432.97l-.207-1.465a.58.58 0 0 1 .09-.395zm5.39.538l.453 3.325a.583.583 0 0 1-.453.65zM6.496 11.545l.17 1.052a.59.59 0 0 1-.293-.776zm3.985 4.344a.59.59 0 0 0-.612.603c0 .358.244.61.601.61a.58.58 0 0 0 .607-.608c0-.35-.242-.605-.596-.605m5.545 0a.59.59 0 0 0-.612.603c0 .358.245.61.602.61a.58.58 0 0 0 .606-.608c0-.35-.24-.605-.596-.605m-8.537.018a.047.047 0 0 0-.048.047v.085c0 .026.021.047.048.047h.52l-.623.9a.1.1 0 0 0-.009.027v.027c0 .026.021.047.048.047h.815a.047.047 0 0 0 .047-.047v-.085a.047.047 0 0 0-.047-.047h-.55l.606-.9l.008-.026v-.028a.047.047 0 0 0-.047-.047zm5.303 0a.047.047 0 0 0-.047.047v1.086c0 .026.02.047.047.047h.135a.047.047 0 0 0 .047-.047v-.454h.545v.454c0 .026.02.047.047.047h.134a.047.047 0 0 0 .047-.047v-1.086a.047.047 0 0 0-.047-.047h-.134a.047.047 0 0 0-.047.047v.453h-.545v-.453a.047.047 0 0 0-.047-.047zm-2.324.164c.25 0 .372.194.372.425c0 .219-.109.425-.358.426c-.242 0-.375-.197-.375-.419c0-.235.108-.432.36-.432zm5.545 0c.25 0 .372.194.372.425c0 .219-.108.425-.358.426c-.242 0-.374-.197-.374-.419c0-.235.108-.432.36-.432",
  "M4.026 9.294v-.707a3.27 3.27 0 0 0 3.268-3.268h.654a3.27 3.27 0 0 0 3.268 3.272V9.3a3.27 3.27 0 0 0-3.268 3.268h-.654a3.27 3.27 0 0 0-3.268-3.273m3.268-5.202h5.62c2.746 0 4.707 1.96 4.707 4.837s-1.96 4.836-4.706 4.836h-5.62V22h2.352v-6.143h3.268c3.948 0 7.059-3.112 7.059-6.928c0-3.817-3.111-6.929-7.06-6.929h-5.62z",
  "m8.25 10.435l-2.165.46l-.01 7.12c0 1.315.99 2.165 2.305 2.165c.73 0 1.265-.135 1.56-.295v-1.69c-.285.115-1.685.525-1.685-.785v-3.16H9.94v-1.89H8.255zm4.455 2.58l-.135-.655h-1.92v7.66h2.215v-5.155c.525-.69 1.41-.555 1.695-.465v-2.04c-.3-.105-1.335-.3-1.855.655M17.32 9.4l-2.23.475v1.81l2.23-.475zM2.245 14.615c0-.345.29-.48.755-.485c.675 0 1.535.205 2.21.57v-2.09a5.9 5.9 0 0 0-2.205-.405c-1.8 0-3 .94-3 2.51c0 2.46 3.375 2.06 3.375 3.12c0 .41-.355.545-.85.545c-.735 0-1.685-.305-2.43-.71v2c.825.355 1.66.505 2.425.505c1.845 0 3.115-.79 3.115-2.39c0-2.645-3.395-2.17-3.395-3.17M32 16.28c0-2.275-1.1-4.07-3.21-4.07s-3.395 1.795-3.395 4.055c0 2.675 1.515 3.91 3.675 3.91c1.06 0 1.855-.24 2.46-.575v-1.67c-.605.305-1.3.49-2.18.49c-.865 0-1.625-.305-1.725-1.345h4.345c.01-.115.03-.58.03-.795m-4.395-.84c0-1 .615-1.42 1.17-1.42c.545 0 1.125.42 1.125 1.42zm-5.645-3.23c-.87 0-1.43.41-1.74.695l-.115-.55H18.15v10.24l2.22-.47l.005-2.51c.32.235.795.56 1.57.56c1.59 0 3.04-1.16 3.04-3.98c.005-2.58-1.465-3.985-3.025-3.985m-.53 6.125c-.52 0-.83-.19-1.045-.42l-.015-3.3c.23-.255.55-.44 1.06-.44c.81 0 1.37.91 1.37 2.07c.005 1.195-.545 2.09-1.37 2.09m-6.335 1.685h2.23v-7.66h-2.23z",
  "M23 21.648H1L12 2.352z",
  "m1.33 19l-.6-1.036l4.33-2.5L7.103 19zm13.856 0H9.412l-3.619-6.268l4.33-2.5zm8.083 0h-5.774l-6.64-11.5l4.33-2.5z",
  "M10 2a4 4 0 0 1 3.46 1.99l.098.182l.638-.368a4 4 0 0 1 5.475 5.446l-.113.186l.638.368a4 4 0 0 1-1.979 7.464L18 17.264V18a4 4 0 0 1-7.459 2.01l-.1-.182l-.637.368a4 4 0 0 1-5.475-5.446l.113-.186l-.638-.368a4 4 0 0 1 1.979-7.464L6 6.736V6a4 4 0 0 1 4-4m4.702 10.788l-.068 4.059a1 1 0 0 1-.391.777l-.109.072l-1.956 1.13a2.002 2.002 0 0 0 3.817-.677L16 18v-4.434l-1.298-.779Zm-2.033 1.946l-3.55 1.97a1 1 0 0 1-.985-.008l-1.956-1.13a2.001 2.001 0 0 0 2.626 2.898l3.84-2.217zm2.687-5.415l-1.323.735l3.482 2.089A1 1 0 0 1 18 13v2.259a2.002 2.002 0 0 0 1.196-3.723zM6 8.74a2.001 2.001 0 0 0-1.328 3.64l.132.083l3.84 2.217l1.323-.735l-3.482-2.088a1 1 0 0 1-.477-.728L6 11zM10 4a2 2 0 0 0-2 2v4.434l1.298.779l.068-4.06a1 1 0 0 1 .5-.85l1.956-1.129A2 2 0 0 0 10 4m7.928 2.268a2 2 0 0 0-2.594-.805l-.138.073l-3.84 2.217l-.025 1.513l3.55-1.97a1 1 0 0 1 .868-.05l.117.058l1.957 1.13c.442-.62.51-1.465.105-2.166"
];

// Create 25+ logos by duplicating and varying the base set
const logoPaths = [
  ...baseLogos, // 8 original logos
  ...baseLogos, // 8 duplicates
  ...baseLogos.slice(0, 9), // 9 more to reach 25
];

const logoTextures = logoPaths.map(path => createLogoSVG(path));

export const StarBackground = (props: Record<string, unknown>) => {
  const ref = useRef<PointsType | null>(null);
  const logoRefs = useRef<(PointsType | null)[]>([]);
  const [sphere] = useState(() =>
    random.inSphere(new Float32Array(5000), { radius: 1.2 })
  );

  // Switch to toggle between logos + stars and stars only
  // Set to true for logos + stars, false for stars only
  const SHOW_LOGOS = false;

  // Load logo textures at the top level
  const texture1 = useTexture(logoTextures[0]);
  const texture2 = useTexture(logoTextures[1]);
  const texture3 = useTexture(logoTextures[2]);
  const texture4 = useTexture(logoTextures[3]);
  const texture5 = useTexture(logoTextures[4]);
  const texture6 = useTexture(logoTextures[5]);
  const texture7 = useTexture(logoTextures[6]);
  const texture8 = useTexture(logoTextures[7]);

  const textures = [texture1, texture2, texture3, texture4, texture5, texture6, texture7, texture8];

  // Create separate point groups for each logo type (only if SHOW_LOGOS is true)
  const [logoGroups] = useState(() => {
    if (!SHOW_LOGOS) return [];
    const groups = [];
    for (let i = 0; i < 8; i++) {
      const groupPositions = [];
      for (let j = 0; j < 5000; j++) {
        if (Math.random() < 0.03) { // ~3% per logo type = ~25% total
          groupPositions.push(sphere[j * 3], sphere[j * 3 + 1], sphere[j * 3 + 2]);
        }
      }
      groups.push(new Float32Array(groupPositions));
    }
    return groups;
  });

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 10;
      ref.current.rotation.y -= delta / 15;
    }
    // Animate all logo groups (only if SHOW_LOGOS is true)
    if (SHOW_LOGOS) {
      logoRefs.current.forEach(logoRef => {
        if (logoRef) {
          logoRef.rotation.x -= delta / 10;
          logoRef.rotation.y -= delta / 15;
        }
      });
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      {/* Regular stars */}
      <Points
        ref={ref}
        stride={3}
        positions={new Float32Array(sphere)}
        frustumCulled
        {...props}
      >
        <PointMaterial
          transparent
          color="#fff"
          size={0.002}
          sizeAttenuation
          depthWrite={false}
        />
      </Points>
      
      {/* Logo groups - only render if SHOW_LOGOS is true */}
      {SHOW_LOGOS && logoGroups.map((positions, index) => (
        <Points
          key={index}
          ref={(el) => {
            if (logoRefs.current) {
              logoRefs.current[index] = el;
            }
          }}
          stride={3}
          positions={positions}
          frustumCulled
          {...props}
        >
          <PointMaterial
            transparent
            color="#fff"
            size={0.02}
            sizeAttenuation
            depthWrite={false}
            map={textures[index]}
          />
        </Points>
      ))}
    </group>
  );
};

export const StarsCanvas = ({ 
  className
}: { 
  className?: string;
}) => {
  const handleCanvasCreated = () => {
    console.log('Canvas created, calling global setCanvasReady');
    (window as Window & { setCanvasReady?: () => void }).setCanvasReady?.();
  };

  return (
    <div className={`w-full h-full absolute inset-0 ${className || ''}`}>
      <Canvas 
        camera={{ position: [0, 0, 1] }}
        onCreated={handleCanvasCreated}
      >
        <Suspense fallback={null}>
          <StarBackground />
        </Suspense>
      </Canvas>
    </div>
  );
};