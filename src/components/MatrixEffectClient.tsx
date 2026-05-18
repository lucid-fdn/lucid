// src/app/MatrixEffectClient.tsx
'use client';

import dynamic from 'next/dynamic';

// Dynamically import the MatrixEffect component with SSR disabled.
const MatrixEffect = dynamic(() => import('../components/MatrixEffect'), { ssr: false });

export default MatrixEffect;
