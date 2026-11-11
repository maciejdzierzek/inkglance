# Setting up an e-reader as an always-on panel

Any e-reader with a web browser and Wi-Fi can show inkai. E-readers are built to
save battery, though: they lock the screen, power off and drop Wi-Fi when nobody
touches them. A panel on your desk needs the opposite, so a few settings matter.

## Everywhere

1. **Keep it on the charger.** A stand with a USB cable turns battery saving
   from a necessity into an option.
2. **Turn off the automatic screen lock**, and set automatic power-off to the
   longest value the reader allows.
3. **Pair once, then bookmark** the panel page. With the bookmark the reader
   comes back to the panel after it wakes up.
4. **Fullscreen**: tap the corner-brackets button in the top bar. The panel
   refreshes in place, so fullscreen survives updates.
5. **On its side**: if the browser has its own rotate option, use it and leave
   inkai's orientation on *automatic*. If it does not, choose *rotate left* or
   *rotate right* in inkai's settings and the page is drawn sideways.

When the reader loses Wi-Fi, the footer shows *no connection to the computer*.
The panel catches up by itself once the connection is back, or with the refresh
button in the top bar.

## PocketBook Verse Pro Color (PB634K3)

Tested with firmware U634K3.6.10.2544. Paths from the
[official manual](https://support.pocketbook-int.com/fw/634K3/u/6.10.2544/manual/User_Manual_Verse_Pro_Color_EN.pdf):

| Where | Setting | Use |
|---|---|---|
| Settings > Saving power | Auto screen lock (off, 5, 10 min) | **off** |
| Settings > Saving power | Power off after (10, 20, 30, 60 min) | **60 min** - there is no "never" |
| Settings > Wi-Fi | Network access | on |
| Browser menu | Rotate screen | for a reader on its side |
| Browser menu > Settings | JavaScript | must stay on |

What we measured on this device:

- The browser is a Chromium 122 engine. Viewport 572 x 663 CSS px
  (dpr 1.875) with the browser bars, more in fullscreen. Cookies, JavaScript
  and fullscreen work.
- It typed `https://` first for a bare address. Running inkai on port 80
  (`"port": 80`) gives a short address and a quick fall-back to plain HTTP.
- There is no speaker; sound goes over Bluetooth only. inkai therefore plays
  alerts on the computer and flashes the reader's screen.
- Even with the screen lock off, the reader still powers off after at most 60
  minutes without a touch, and Wi-Fi drops when it sleeps. Whether page refreshes
  or charging postpone that is still being tested.

Got another reader working? Settings paths and measurements for other models
are welcome as a pull request to this file.
