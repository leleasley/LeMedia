import { useEffect, useRef } from 'react';

/**
 * Hook to lock the body scroll whenever a component is mounted or
 * whenever isLocked is set to true.
 *
 * You can pass in true always to cause a lock on mount/dismount of the component
 * using this hook.
 *
 * @param isLocked Toggle the scroll lock
 * @param disabled Disables the entire hook (allows conditional skipping of the lock)
 */
export const useLockBodyScroll = (
    isLocked: boolean,
    disabled?: boolean
): void => {
    const originalOverflow = useRef<string | null>(null);
    const originalTouchAction = useRef<string | null>(null);

    useEffect(() => {
        if (disabled) return;

        const body = document.body;

        if (isLocked) {
            if (originalOverflow.current === null) {
                originalOverflow.current = body.style.overflow || window.getComputedStyle(body).overflow;
            }
            if (originalTouchAction.current === null) {
                originalTouchAction.current = body.style.touchAction || window.getComputedStyle(body).touchAction;
            }
            body.style.overflow = 'hidden';
            body.style.touchAction = 'none';
        } else if (originalOverflow.current !== null || originalTouchAction.current !== null) {
            body.style.overflow = originalOverflow.current ?? '';
            body.style.touchAction = originalTouchAction.current ?? '';
            originalOverflow.current = null;
            originalTouchAction.current = null;
        }

        return () => {
            if (!isLocked) return;
            if (originalOverflow.current !== null || originalTouchAction.current !== null) {
                body.style.overflow = originalOverflow.current ?? '';
                body.style.touchAction = originalTouchAction.current ?? '';
                originalOverflow.current = null;
                originalTouchAction.current = null;
            }
        };
    }, [isLocked, disabled]);
};

export default useLockBodyScroll;
