import { Keyboard } from "grammy";

export function mainShortcutKeyboard() {
  return new Keyboard()
    .text("/request")
    .text("/mystuff")
    .row()
    .text("/trending")
    .text("/services")
    .row()
    .text("/watch")
    .text("/help")
    .resized();
}

export function adminShortcutKeyboard() {
  return new Keyboard()
    .text("/request")
    .text("/mystuff")
    .row()
    .text("/trending")
    .text("/services")
    .row()
    .text("/pending")
    .text("/help")
    .resized();
}
