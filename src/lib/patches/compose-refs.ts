/**
 * Fixed version of @radix-ui/react-compose-refs for React 19 compatibility.
 *
 * React 19 changed ref callback semantics — they can now return cleanup functions.
 * The original compose-refs returns cleanup functions from setRef/composeRefs,
 * which creates infinite setState loops when used inline (not via useComposedRefs).
 *
 * Fix: setRef never returns a value, composeRefs never returns cleanup.
 * React 19 handles unmount by calling the ref callback with null.
 *
 * @see https://github.com/radix-ui/primitives/issues/3799
 */
import * as React from 'react'

type PossibleRef<T> = React.Ref<T> | undefined

function setRef<T>(ref: PossibleRef<T>, value: T) {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref !== null && ref !== undefined) {
    ;(ref as React.MutableRefObject<T>).current = value
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node: T) => {
    refs.forEach((ref) => setRef(ref, node))
  }
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(composeRefs(...refs), refs)
}

export { composeRefs, useComposedRefs }
