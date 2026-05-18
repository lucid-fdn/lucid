"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { useThemeLogo } from "@/hooks/use-theme-logo";

interface HeroLoaderProps {
  children: React.ReactNode;
  videoSrc: string;
}

export function HeroLoader({ children, videoSrc }: HeroLoaderProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const loaderVideoRef = useRef<HTMLVideoElement>(null);
  const { logoAnimated } = useThemeLogo();

  // Set up global canvas ready function
  useEffect(() => {
    (window as Window & { setCanvasReady?: () => void }).setCanvasReady = () => {
      console.log('Canvas ready detected');
      setIsCanvasLoaded(true);
    };

    return () => {
      delete (window as Window & { setCanvasReady?: () => void }).setCanvasReady;
    };
  }, []);

  // Handle video loading
  const handleVideoLoad = () => {
    console.log('Video loaded successfully');
    setIsVideoLoaded(true);
  };

  const handleVideoError = (e: Event) => {
    console.log('Video error:', e);
    // Still mark as loaded to prevent infinite loading
    setIsVideoLoaded(true);
  };

  // Check if the main video in the hero is loaded
  useEffect(() => {
    const checkMainVideo = () => {
      const mainVideo = document.querySelector(`video[src="${videoSrc}"]`) as HTMLVideoElement;
      if (mainVideo) {
        console.log('Found main video, checking if loaded');
        if (mainVideo.readyState >= 3) { // HAVE_FUTURE_DATA or higher
          console.log('Main video already loaded');
          setIsVideoLoaded(true);
        } else {
          mainVideo.addEventListener('canplaythrough', handleVideoLoad);
          mainVideo.addEventListener('error', handleVideoError);
        }
      } else {
        // Fallback: check for any video element
        const anyVideo = document.querySelector('video') as HTMLVideoElement;
        if (anyVideo && anyVideo.readyState >= 3) {
          console.log('Found and loaded video element');
          setIsVideoLoaded(true);
        }
      }
    };

    // Check immediately and also after a short delay
    checkMainVideo();
    const timer = setTimeout(checkMainVideo, 100);
    
    return () => clearTimeout(timer);
  }, [videoSrc]);

  // Start loader video immediately when ready
  useEffect(() => {
    const startLoaderVideo = () => {
      if (loaderVideoRef.current) {
        console.log('Starting loader video immediately');
        loaderVideoRef.current.play().catch(console.error);
      }
    };

    // Try to start immediately
    startLoaderVideo();
    
    // Also try after a short delay in case the video isn't ready yet
    const timer = setTimeout(startLoaderVideo, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Debug current state
  useEffect(() => {
    console.log('Current loading state:', { isVideoLoaded, isCanvasLoaded, isLoading });
  }, [isVideoLoaded, isCanvasLoaded, isLoading]);

  // Check if both are loaded
  useEffect(() => {
    if (isVideoLoaded && isCanvasLoaded) {
      console.log('Both video and canvas loaded, hiding loader');
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500); // Small delay for smooth transition
      return () => clearTimeout(timer);
    }
  }, [isVideoLoaded, isCanvasLoaded]);

  // Fallback timeout to prevent infinite loading
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      console.log('Fallback: Hiding loader after 3 seconds');
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(fallbackTimer);
  }, []);

  return (
    <>
      {/* Loading overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          >
            {/* Loader GIF */}
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* <video
                ref={loaderVideoRef}
                preload="auto"
                autoPlay
                muted
                loop
                playsInline
                className="w-[150px] h-[150px] object-cover rounded-lg"
                onLoadedData={() => {
                  console.log('Loader video loaded, starting playback');
                  if (loaderVideoRef.current) {
                    loaderVideoRef.current.play().catch(console.error);
                  }
                }}
              >
                <source src="/videos/Lucid.webm" type="video/webm" />
              </video> */}
              <Image
                src={logoAnimated}
                alt="Loading..."
                width={150}
                height={150}
                className="w-[150px] h-[150px] object-cover rounded-lg"
                unoptimized
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div style={{ visibility: isLoading ? 'hidden' : 'visible' }}>
        {children}
      </div>
    </>
  );
}
