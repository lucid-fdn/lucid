"use client"

import React from "react"
import { useCommandPalette } from "./command-palette"
import { Button } from "./button"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"

export function CommandDemo() {
  const { open: _open, setOpen } = useCommandPalette()

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 p-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          AI Ecosystem Search
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
          Search across our entire AI ecosystem - models, datasets, compute resources, 
          agents, apps, and more. Use the command palette to quickly find what you need.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Button
          onClick={() => setOpen(true)}
          color="blue"
          className="flex items-center gap-2"
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          Open Command Palette
        </Button>
        
        <div className="text-sm text-gray-500 dark:text-gray-400">
          or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">⌘K</kbd>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Models</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Search for GPT-4, Claude, Llama, and other AI models
          </p>
        </div>
        
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Datasets</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Find datasets for training and fine-tuning models
          </p>
        </div>
        
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Compute</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Discover GPU clusters and compute resources
          </p>
        </div>
        
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Agents</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Explore AI agents for various tasks
          </p>
        </div>
        
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Apps</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ready-to-deploy AI applications
          </p>
        </div>
        
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Documentation</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Guides, tutorials, and API references
          </p>
        </div>
      </div>
    </div>
  )
}
