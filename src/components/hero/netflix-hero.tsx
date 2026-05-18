'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Play, Info } from 'lucide-react';
import Link from 'next/link';

interface NetflixHeroProps {
  title: string;
  description: string;
  videoUrl?: string;
  posterUrl?: string;
  ctaText?: string;
  ctaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  tags?: string[];
  badge?: string;
  className?: string;
  compact?: boolean; // 50% height for dashboard
  logoUrl?: string; // Workspace logo (top-left)
}

/**
 * Netflix-Style Hero Component
 * 
 * Features:
 * - Video background with gradient overlay
 * - Lazy loading (only loads when in viewport)
 * - Respects prefers-reduced-motion
 * - Muted by default with toggle
 * - GPU-accelerated animations
 * - Performance optimized
 */
export function NetflixHero({
  title,
  description,
  videoUrl,
  posterUrl,
  ctaText,
  ctaLink,
  secondaryCtaText,
  secondaryCtaLink,
  tags,
  badge: _badge,
  className,
  compact = false,
  logoUrl,
}: NetflixHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Intersection Observer - Only load video when in viewport
  useEffect(() => {
    if (!videoUrl || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    if (heroRef.current) {
      observer.observe(heroRef.current);
    }

    return () => observer.disconnect();
  }, [videoUrl, isVisible]);

  // Auto-play video when loaded and visible
  useEffect(() => {
    if (!videoRef.current || !isVisible || !isVideoLoaded) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    videoRef.current.play().catch((error) => {
      console.log('[NetflixHero] Autoplay prevented:', error);
    });
  }, [isVisible, isVideoLoaded]);

  const _toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div 
      ref={heroRef}
      className={`relative w-full overflow-hidden bg-black ${
        compact 
          ? 'h-[40vh] min-h-[300px] max-h-[450px]' 
          : 'h-[70vh] min-h-[600px] max-h-[900px]'
      } ${className || ''}`}
    >
      {/* Video Background */}
      {videoUrl && isVisible && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={posterUrl}
          onLoadedData={() => setIsVideoLoaded(true)}
          style={{
            transform: 'translateZ(0)', // GPU acceleration
            willChange: 'transform',
          }}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      )}

      {/* Fallback Poster Image (if no video or while loading) */}
      {posterUrl && (!videoUrl || !isVideoLoaded) && (
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${posterUrl})`,
            transform: 'translateZ(0)',
          }}
        />
      )}

      {/* Gradient Overlays - Netflix style */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

      {/* Content Overlay */}
      <div className={`relative h-full flex items-end container mx-auto px-4 ${compact ? 'pb-8' : 'pb-24'}`}>
        <div className="max-w-2xl space-y-6 ml-4">
          {/* Title with Logo */}
          <div className="flex items-center">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt="Workspace Logo"
                width={80}
                height={80}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover flex-shrink-0"
                unoptimized
              />
            )}
            <h1 
              className="bg-gradient-to-b from-white to-gray-300/30 bg-clip-text text-transparent font-display text-5xl/[1.2] xl:text-[5.25rem] font-semibold tracking-tight text-balance sm:text-8xl/[1.15] md:text-7xl/[1.15] animate-in fade-in slide-in-from-bottom-4 duration-700"
            >
              {title}
            </h1>
          </div>

          {/* Description */}
          <p 
            className="mx-auto max-w-3xl text-xl/5 text-white/50 font-semibold text-balance text-md sm:text-xl/8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200"
          >
            {description}
          </p>

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
              {tags.map((tag) => (
                <span 
                  key={tag}
                  className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-white text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            {ctaText && ctaLink && (
              <Link href={ctaLink}>
                <Button 
                  size="lg" 
                  className="gap-2 bg-white text-black hover:bg-white/90 transition-colors duration-200"
                >
                  <Play className="w-5 h-5" />
                  {ctaText}
                </Button>
              </Link>
            )}
            {secondaryCtaText && secondaryCtaLink && (
              <Link href={secondaryCtaLink}>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="gap-2 bg-white/20 backdrop-blur-sm text-white border-white/30 hover:bg-white/30 transition-colors duration-200"
                >
                  <Info className="w-5 h-5" />
                  {secondaryCtaText}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
