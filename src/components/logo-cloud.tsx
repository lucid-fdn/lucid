"use client"

import { InfiniteSlider } from './motion-primitives/infinite-slider'
import { Mistral, Claude, OpenAI, Ollama, DeepSeek, Qwen, AlibabaCloud } from '@lobehub/icons'
import { useState, useEffect } from 'react'

interface LogoCloudProps {
  text?: string
}

export default function LogoCloud({ text }: LogoCloudProps) {
  const [currentText, setCurrentText] = useState(0)
  const texts = [
    "Powering the best AIs",
    "Empowering innovation",
    "Driving AI forward",
    "Building the future",
    "Connecting minds"
  ]

  const showText = !!text

  useEffect(() => {
    if (!showText) return

    const interval = setInterval(() => {
      setCurrentText((prev) => (prev + 1) % texts.length)
    }, 3000) // Change text every 3 seconds

    return () => clearInterval(interval)
  }, [texts.length, showText])

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 lg:h-24 h-22 overflow-hidden">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
      <div className={`group relative lg:h-24 h-22 m-auto ${showText ? 'pl-6' : ''}`}>
        <div className="h-full flex flex-col items-center md:flex-row">
          {showText && (
            <div className="md:max-w-40 md:border-r md:pr-6">
              <p className="text-end text-sm hidden xl:block transition-all duration-500 ease-in-out">
                {text || texts[currentText]}
              </p>
            </div>
          )}
          <div className={`relative py-6 ${showText ? 'md:w-[calc(100%-11rem)]' : 'w-full'}`}>
            <InfiniteSlider speedOnHover={26} speed={80} gap={49}>
              <div className="flex opacity-70">
                <Mistral.Combine size={41} type={'color'} />
              </div>
              <div className="flex opacity-70">
                <Claude.Combine size={41} type={'color'} />
              </div>
              <div className="flex opacity-70">
                <OpenAI.Combine size={41} extra={'ChatGPT'} showText={false} />
              </div>
              <div className="flex opacity-70">
                <Ollama.Combine size={41} />
              </div>
              <div className="flex opacity-70">
                <DeepSeek.Combine size={41} type={'color'} />
              </div>
              <div className="flex opacity-70">
                <Qwen.Combine size={41} type={'color'} />
              </div>
              <div className="flex opacity-70">
                <AlibabaCloud.Text size={30} />
              </div>
            </InfiniteSlider>

            {/* <div className="bg-linear-to-r from-none absolute inset-y-0 left-0 w-20"></div>
            <div className="bg-linear-to-l from-none absolute inset-y-0 right-0 w-20"></div> */}
            {/* <ProgressiveBlur
              className="pointer-events-none absolute left-0 top-0 h-full w-80"
              direction="left"
              blurIntensity={0.9}
            />
            <ProgressiveBlur
              className="pointer-events-none absolute right-0 top-0 h-full w-20"
              direction="right"
              blurIntensity={1}
            /> */}
          </div>
        </div>
      </div>
    </div>
  );
}
