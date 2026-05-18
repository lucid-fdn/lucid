'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Loader2 } from 'lucide-react'
import { getCroppedImg, type Area } from '@/lib/image-utils'

interface ImageCropModalProps {
  image: string // blob URL or data URL
  onComplete: (croppedImage: Blob) => void
  onCancel: () => void
}

/**
 * Image crop modal using react-easy-crop
 * Provides drag-to-crop and zoom functionality
 */
export function ImageCropModal({ image, onComplete, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [loading, setLoading] = useState(false)

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    
    setLoading(true)
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels)
      onComplete(croppedBlob)
    } catch (error) {
      console.error('[image-crop-modal] Error cropping image:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        {/* Cropper Area */}
        <div className="relative h-[400px] w-full bg-muted rounded-lg overflow-hidden">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1} // Square crop
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={true}
            cropShape="round" // Circular crop for avatars
          />
        </div>

        {/* Zoom Slider */}
        <div className="space-y-2 px-2">
          <Label htmlFor="zoom" className="text-sm">
            Zoom
          </Label>
          <Slider
            id="zoom"
            min={1}
            max={3}
            step={0.1}
            value={[zoom]}
            onValueChange={([value]) => setZoom(value)}
            className="w-full"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Processing...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
