/**
 * Global Asset Modal Manager
 * 
 * Ensures only ONE asset hover modal is open at a time (Netflix-style)
 * Uses a simple pub/sub pattern for cross-component coordination
 */

type ModalChangeListener = (openAssetId: string | null) => void;

class AssetModalManager {
  private currentOpenAssetId: string | null = null;
  private listeners: Set<ModalChangeListener> = new Set();

  /**
   * Request to open a modal for an asset
   * Closes any currently open modal first
   */
  openModal(assetId: string) {
    if (this.currentOpenAssetId !== assetId) {
      this.currentOpenAssetId = assetId;
      this.notifyListeners();
    }
  }

  /**
   * Close the modal for a specific asset
   */
  closeModal(assetId: string) {
    if (this.currentOpenAssetId === assetId) {
      this.currentOpenAssetId = null;
      this.notifyListeners();
    }
  }

  /**
   * Check if a specific asset's modal is currently open
   */
  isOpen(assetId: string): boolean {
    return this.currentOpenAssetId === assetId;
  }

  /**
   * Subscribe to modal state changes
   */
  subscribe(listener: ModalChangeListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      listener(this.currentOpenAssetId);
    });
  }
}

// Singleton instance
export const assetModalManager = new AssetModalManager();
