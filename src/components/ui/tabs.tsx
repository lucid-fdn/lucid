"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

type Tab = {
  title: string | ReactNode
  value: string
  content?: string | ReactNode
}

export const Tabs = ({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
  value,
  onValueChange,
  layout = "stack",
}: {
  tabs: Tab[]
  containerClassName?: string
  activeTabClassName?: string
  tabClassName?: string
  contentClassName?: string
  value?: string
  onValueChange?: (value: string) => void
  layout?: "stack" | "page"
}) => {
  const initialTab = propTabs.find((tab) => tab.value === value) ?? propTabs[0]
  const [active, setActive] = useState<Tab>(initialTab)
  const [tabs, setTabs] = useState<Tab[]>(() => moveSelectedTabToTop(propTabs, initialTab?.value))
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (!value) return
    const nextActive = propTabs.find((tab) => tab.value === value)
    if (!nextActive || nextActive.value === active?.value) return
    setActive(nextActive)
    setTabs(moveSelectedTabToTop(propTabs, nextActive.value))
  }, [active?.value, propTabs, value])

  const moveSelectedTabToTopByIndex = (idx: number) => {
    const newTabs = [...propTabs]
    const selectedTab = newTabs.splice(idx, 1)
    newTabs.unshift(selectedTab[0])
    setTabs(newTabs)
    setActive(newTabs[0])
    onValueChange?.(newTabs[0].value)
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-row items-center justify-start [perspective:1000px] relative overflow-auto sm:overflow-visible no-visible-scrollbar max-w-full w-full",
          containerClassName
        )}
      >
        {propTabs.map((tab, idx) => (
          <button
            key={tab.value}
            onClick={() => {
              moveSelectedTabToTopByIndex(idx)
            }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            className={cn("relative px-4 py-2 rounded-full", tabClassName)}
            style={{
              transformStyle: "preserve-3d",
            }}
          >
            {active.value === tab.value && (
              <motion.div
                layoutId="clickedbutton"
                transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                className={cn("absolute inset-0 bg-gray-200 dark:bg-zinc-800 rounded-full", activeTabClassName)}
              />
            )}

            <span className="relative block text-foreground">
              {tab.title}
            </span>
          </button>
        ))}
      </div>
      {layout === "page" ? (
        <ActiveTabContent active={active} className={cn("mt-6", contentClassName)} />
      ) : (
        <FadeInDiv
          tabs={tabs}
          active={active}
          key={active.value}
          hovering={hovering}
          className={cn("mt-32", contentClassName)}
        />
      )}
    </>
  )
}

export const ActiveTabContent = ({
  active,
  className,
}: {
  active: Tab
  className?: string
}) => {
  return (
    <div className={cn("relative w-full", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active.value}
          initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(6px)" }}
          transition={{ type: "spring", bounce: 0.12, duration: 0.34 }}
        >
          {active.content}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export const FadeInDiv = ({
  className,
  tabs,
  hovering,
}: {
  className?: string
  key?: string
  tabs: Tab[]
  active: Tab
  hovering?: boolean
}) => {
  const isActive = (tab: Tab) => {
    return tab.value === tabs[0]?.value
  }
  return (
    <div className="relative w-full h-full">
      {tabs.map((tab, idx) => (
        <motion.div
          key={tab.value}
          layoutId={tab.value}
          style={{
            scale: 1 - idx * 0.1,
            top: hovering ? idx * -50 : 0,
            zIndex: -idx,
            opacity: idx < 3 ? 1 - idx * 0.1 : 0,
          }}
          animate={{
            y: isActive(tab) ? [0, 40, 0] : 0,
          }}
          className={cn("w-full h-full absolute top-0 left-0", className)}
        >
          {tab.content}
        </motion.div>
      ))}
    </div>
  )
}

function moveSelectedTabToTop(tabs: Tab[], selectedValue?: string) {
  const newTabs = [...tabs]
  const idx = newTabs.findIndex((tab) => tab.value === selectedValue)
  if (idx <= 0) return newTabs
  const selectedTab = newTabs.splice(idx, 1)
  newTabs.unshift(selectedTab[0])
  return newTabs
}
