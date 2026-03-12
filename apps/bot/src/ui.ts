import { Keyboard } from "grammy";

export function mainShortcutKeyboard() {
  return new Keyboard()
    .text("/request")
    .text("/mystuff")
    .row()
    .text("/follow")
    .text("/following")
    .row()
    .text("/trending")
    .text("/services")
    .text("/help")
    .resized();
}

export function adminShortcutKeyboard() {
  return new Keyboard()
    .text("/request")
    .text("/mystuff")
    .row()
    .text("/follow")
    .text("/following")
    .row()
    .text("/trending")
    .text("/services")
    .text("/pending")
    .text("/help")
    .resized();
}
